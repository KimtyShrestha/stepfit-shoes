const express = require('express');
const crypto = require('crypto');
const { query, withTransaction } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

/**
 * Simulated payment authorisation.
 *
 * A real deployment would delegate to a PCI-compliant provider such as
 * Stripe so that card data never reaches this server. The simulation
 * models the same contract: an opaque reference on success, a failure
 * signal otherwise, and no card data stored locally.
 */
function authorisePayment(totalCents) {
  if (totalCents <= 0) {
    return { approved: false, reference: null };
  }
  return {
    approved: true,
    reference: `sim_${crypto.randomBytes(12).toString('hex')}`,
  };
}

/**
 * POST /api/orders/checkout
 * Converts the cart into an order.
 */
router.post('/checkout', async (req, res) => {
  try {
    const shippingAddress =
      typeof req.body?.shippingAddress === 'string' ? req.body.shippingAddress.trim() : '';

    if (shippingAddress.length < 10 || shippingAddress.length > 500) {
      return res.status(400).json({ error: 'A shipping address of 10-500 characters is required.' });
    }

    const order = await withTransaction(async (client) => {
      const cart = await client.query(
        `SELECT ci.product_id, ci.quantity, p.name, p.price_cents, p.stock
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         WHERE ci.user_id = $1 AND p.is_active = TRUE
         FOR UPDATE OF p`,
        [req.user.id]
      );

      if (cart.rows.length === 0) {
        const err = new Error('EMPTY_CART');
        throw err;
      }

      for (const item of cart.rows) {
        if (item.quantity > item.stock) {
          const err = new Error('INSUFFICIENT_STOCK');
          err.detail = item.name;
          throw err;
        }
      }

      const totalCents = Number(req.body?.totalCents ?? 0);

      const payment = authorisePayment(totalCents);
      if (!payment.approved) {
        const err = new Error('PAYMENT_DECLINED');
        throw err;
      }

      const created = await client.query(
        `INSERT INTO orders (user_id, total_cents, status, shipping_address, payment_ref)
         VALUES ($1, $2, 'paid', $3, $4)
         RETURNING id, total_cents, status, created_at`,
        [req.user.id, totalCents, shippingAddress, payment.reference]
      );
      const orderRow = created.rows[0];

      for (const item of cart.rows) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderRow.id, item.product_id, item.name, item.price_cents, item.quantity]
        );

        await client.query('UPDATE products SET stock = stock - $2 WHERE id = $1', [
          item.product_id,
          item.quantity,
        ]);
      }

      await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);

      await client.query(
        `INSERT INTO activity_logs (user_id, action, status, ip_address, user_agent, metadata)
         VALUES ($1, 'ORDER_PLACED', 'success', $2, $3, $4)`,
        [
          req.user.id,
          req.ip,
          (req.get('user-agent') || '').slice(0, 500),
          JSON.stringify({ orderId: orderRow.id, totalCents }),
        ]
      );

      return orderRow;
    });

    return res.status(201).json({
      message: 'Order placed successfully.',
      order: {
        id: order.id,
        totalCents: order.total_cents,
        status: order.status,
        createdAt: order.created_at,
      },
    });
  } catch (err) {
    if (err.message === 'EMPTY_CART') {
      return res.status(400).json({ error: 'Your cart is empty.' });
    }
    if (err.message === 'INSUFFICIENT_STOCK') {
      return res.status(409).json({ error: `Not enough stock for ${err.detail}.` });
    }
    if (err.message === 'PAYMENT_DECLINED') {
      return res.status(402).json({ error: 'Payment was declined.' });
    }
    console.error('[orders:checkout]', err.message);
    return res.status(500).json({ error: 'Checkout failed. Please try again.' });
  }
});

/**
 * GET /api/orders
 * The caller's own order history.
 */
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, total_cents, status, shipping_address, payment_ref, created_at
       FROM orders WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    return res.json({ orders: result.rows });
  } catch (err) {
    console.error('[orders:list]', err.message);
    return res.status(500).json({ error: 'Could not load orders.' });
  }
});

/**
 * GET /api/orders/:id
 * Single order with its line items.
 */
router.get('/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid order id.' });
    }

    const orderResult = await query(
      `SELECT id, user_id, total_cents, status, shipping_address, payment_ref, created_at
       FROM orders WHERE id = $1`,
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const itemsResult = await query(
      `SELECT product_name, unit_price_cents, quantity
       FROM order_items WHERE order_id = $1`,
      [id]
    );

    return res.json({
      order: orderResult.rows[0],
      items: itemsResult.rows,
    });
  } catch (err) {
    console.error('[orders:get]', err.message);
    return res.status(500).json({ error: 'Could not load order.' });
  }
});

module.exports = router;
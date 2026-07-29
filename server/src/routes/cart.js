const express = require('express');
const { query, withTransaction } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const MAX_QUANTITY = 20;

// Every cart operation belongs to the signed-in user.
router.use(requireAuth);

/** Returns the caller's cart with live product data and a server-side total. */
async function loadCart(userId) {
  const result = await query(
    `SELECT ci.product_id, ci.quantity,
            p.name, p.brand, p.price_cents, p.stock, p.image_url
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = $1 AND p.is_active = TRUE
     ORDER BY ci.product_id`,
    [userId]
  );

  const items = result.rows.map((row) => ({
    productId: row.product_id,
    name: row.name,
    brand: row.brand,
    unitPriceCents: row.price_cents,
    quantity: row.quantity,
    stock: row.stock,
    imageUrl: row.image_url,
    lineTotalCents: row.price_cents * row.quantity,
  }));

  const totalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);

  return { items, totalCents };
}

/**
 * GET /api/cart
 */
router.get('/', async (req, res) => {
  try {
    return res.json(await loadCart(req.user.id));
  } catch (err) {
    console.error('[cart:get]', err.message);
    return res.status(500).json({ error: 'Could not load cart.' });
  }
});

/**
 * POST /api/cart
 * Adds a product, or increases its quantity if already present.
 */
router.post('/', async (req, res) => {
  try {
    const productId = Number.parseInt(req.body?.productId, 10);
    const quantity = Number.parseInt(req.body?.quantity ?? 1, 10);

    if (!Number.isInteger(productId) || productId < 1) {
      return res.status(400).json({ error: 'A valid productId is required.' });
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return res.status(400).json({ error: `Quantity must be between 1 and ${MAX_QUANTITY}.` });
    }

    await withTransaction(async (client) => {
      const product = await client.query(
        'SELECT id, stock FROM products WHERE id = $1 AND is_active = TRUE',
        [productId]
      );

      if (product.rows.length === 0) {
        const err = new Error('PRODUCT_NOT_FOUND');
        err.statusCode = 404;
        throw err;
      }

      // Stock is checked against the resulting total, not the added
      // amount, so repeated small additions cannot exceed availability.
      const existing = await client.query(
        'SELECT quantity FROM cart_items WHERE user_id = $1 AND product_id = $2',
        [req.user.id, productId]
      );

      const currentQty = existing.rows[0]?.quantity ?? 0;
      const newQty = Math.min(currentQty + quantity, MAX_QUANTITY);

      if (newQty > product.rows[0].stock) {
        const err = new Error('INSUFFICIENT_STOCK');
        err.statusCode = 409;
        throw err;
      }

      await client.query(
        `INSERT INTO cart_items (user_id, product_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, product_id)
         DO UPDATE SET quantity = $3`,
        [req.user.id, productId, newQty]
      );
    });

    return res.status(201).json(await loadCart(req.user.id));
  } catch (err) {
    if (err.message === 'PRODUCT_NOT_FOUND') {
      return res.status(404).json({ error: 'Product not found.' });
    }
    if (err.message === 'INSUFFICIENT_STOCK') {
      return res.status(409).json({ error: 'Not enough stock available.' });
    }
    console.error('[cart:add]', err.message);
    return res.status(500).json({ error: 'Could not update cart.' });
  }
});

/**
 * PATCH /api/cart/:productId
 * Sets an exact quantity.
 */
router.patch('/:productId', async (req, res) => {
  try {
    const productId = Number.parseInt(req.params.productId, 10);
    const quantity = Number.parseInt(req.body?.quantity, 10);

    if (!Number.isInteger(productId) || productId < 1) {
      return res.status(400).json({ error: 'Invalid product id.' });
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return res.status(400).json({ error: `Quantity must be between 1 and ${MAX_QUANTITY}.` });
    }

    const stockCheck = await query(
      'SELECT stock FROM products WHERE id = $1 AND is_active = TRUE',
      [productId]
    );
    if (stockCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    if (quantity > stockCheck.rows[0].stock) {
      return res.status(409).json({ error: 'Not enough stock available.' });
    }

    // The user_id predicate is what scopes this to the caller's own
    // cart. Without it, any user could alter another user's rows.
    const updated = await query(
      `UPDATE cart_items SET quantity = $3
       WHERE user_id = $1 AND product_id = $2`,
      [req.user.id, productId, quantity]
    );

    if (updated.rowCount === 0) {
      return res.status(404).json({ error: 'Item not in cart.' });
    }

    return res.json(await loadCart(req.user.id));
  } catch (err) {
    console.error('[cart:update]', err.message);
    return res.status(500).json({ error: 'Could not update cart.' });
  }
});

/**
 * DELETE /api/cart/:productId
 */
router.delete('/:productId', async (req, res) => {
  try {
    const productId = Number.parseInt(req.params.productId, 10);
    if (!Number.isInteger(productId) || productId < 1) {
      return res.status(400).json({ error: 'Invalid product id.' });
    }

    await query('DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2', [
      req.user.id,
      productId,
    ]);

    return res.json(await loadCart(req.user.id));
  } catch (err) {
    console.error('[cart:remove]', err.message);
    return res.status(500).json({ error: 'Could not update cart.' });
  }
});

module.exports = router;
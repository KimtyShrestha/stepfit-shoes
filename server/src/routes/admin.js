const express = require('express');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

/**
 * GET /api/admin/users
 */
router.get('/users', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, full_name, role, mfa_enabled,
              failed_login_attempts, lock_until, created_at
       FROM users ORDER BY id`
    );
    return res.json({ users: result.rows });
  } catch (err) {
    console.error('[admin:users]', err.message);
    return res.status(500).json({ error: 'Could not load users.' });
  }
});

/**
 * GET /api/admin/orders
 */
router.get('/orders', async (req, res) => {
  try {
    const result = await query(
      `SELECT o.id, o.user_id, u.email, o.total_cents, o.status, o.created_at
       FROM orders o JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC LIMIT 100`
    );
    return res.json({ orders: result.rows });
  } catch (err) {
    console.error('[admin:orders]', err.message);
    return res.status(500).json({ error: 'Could not load orders.' });
  }
});

/**
 * GET /api/admin/logs
 */
router.get('/logs', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, user_id, action, status, ip_address, metadata, created_at
       FROM activity_logs ORDER BY created_at DESC LIMIT 100`
    );
    return res.json({ logs: result.rows });
  } catch (err) {
    console.error('[admin:logs]', err.message);
    return res.status(500).json({ error: 'Could not load logs.' });
  }
});

/**
 * POST /api/admin/products
 */
router.post('/products', async (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const brand = typeof req.body?.brand === 'string' ? req.body.brand.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : '';
    const priceCents = Number.parseInt(req.body?.priceCents, 10);
    const stock = Number.parseInt(req.body?.stock, 10);

    if (!name || name.length > 150) return res.status(400).json({ error: 'Invalid name.' });
    if (!brand || brand.length > 80) return res.status(400).json({ error: 'Invalid brand.' });
    if (!Number.isInteger(priceCents) || priceCents < 0) {
      return res.status(400).json({ error: 'Invalid price.' });
    }
    if (!Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({ error: 'Invalid stock.' });
    }

    const result = await query(
      `INSERT INTO products (name, brand, description, price_cents, stock, image_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, brand, price_cents, stock, image_url`,
      [name, brand, description, priceCents, stock, imageUrl || null]
    );

    await query(
      `INSERT INTO activity_logs (user_id, action, status, ip_address, metadata)
       VALUES ($1, 'PRODUCT_CREATED', 'success', $2, $3)`,
      [req.user.id, req.ip, JSON.stringify({ productId: result.rows[0].id })]
    );

    return res.status(201).json({ product: result.rows[0] });
  } catch (err) {
    console.error('[admin:createProduct]', err.message);
    return res.status(500).json({ error: 'Could not create product.' });
  }
});

module.exports = router;
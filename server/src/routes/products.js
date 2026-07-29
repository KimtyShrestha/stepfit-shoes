const express = require('express');
const { query } = require('../db');

const router = express.Router();

const MAX_PAGE_SIZE = 24;

/**
 * Coerces a value to a bounded integer.
 * Pagination values reach SQL as LIMIT/OFFSET, so they are validated
 * as numbers rather than passed through as strings.
 */
function toBoundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/**
 * GET /api/products
 * Public catalogue with optional search and brand filter.
 */
router.get('/', async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 80) : '';
    const brand = typeof req.query.brand === 'string' ? req.query.brand.trim().slice(0, 80) : '';
    const limit = toBoundedInt(req.query.limit, 12, 1, MAX_PAGE_SIZE);
    const offset = toBoundedInt(req.query.offset, 0, 0, 10000);

    // Conditions are built from a fixed set of strings; every
    // user-supplied value enters only as a numbered placeholder.
    const conditions = ['is_active = TRUE'];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR brand ILIKE $${params.length})`);
    }

    if (brand) {
      params.push(brand);
      conditions.push(`brand = $${params.length}`);
    }

    params.push(limit);
    const limitPlaceholder = `$${params.length}`;
    params.push(offset);
    const offsetPlaceholder = `$${params.length}`;

    const result = await query(
      `SELECT id, name, brand, description, price_cents, stock, image_url
       FROM products
       WHERE ${conditions.join(' AND ')}
       ORDER BY id
       LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      params
    );

    return res.json({ products: result.rows, limit, offset });
  } catch (err) {
    console.error('[products:list]', err.message);
    return res.status(500).json({ error: 'Could not load products.' });
  }
});

/**
 * GET /api/products/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid product id.' });
    }

    const result = await query(
      `SELECT id, name, brand, description, price_cents, stock, image_url
       FROM products
       WHERE id = $1 AND is_active = TRUE`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    return res.json({ product: result.rows[0] });
  } catch (err) {
    console.error('[products:get]', err.message);
    return res.status(500).json({ error: 'Could not load product.' });
  }
});

module.exports = router;
const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

// Product list, used to populate the visit-entry product picker and the
// product catalog screen. Staff only.
router.get('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, category, sku, price, stock_qty, duration_days, description FROM products ORDER BY name'
  );
  res.json(rows);
}));

// Add a product to the catalog. Staff only.
router.post('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { name, category, sku, price, stock_qty, duration_days, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  if (sku) {
    const existing = await pool.query('SELECT id FROM products WHERE sku = $1', [sku]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A product with this SKU already exists' });
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO products (name, category, sku, price, stock_qty, duration_days, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, category, sku, price, stock_qty, duration_days, description`,
    [
      name,
      category || null,
      sku || null,
      price === '' || price == null ? null : price,
      stock_qty === '' || stock_qty == null ? 0 : stock_qty,
      duration_days === '' || duration_days == null ? null : duration_days,
      description || null,
    ]
  );
  res.status(201).json(rows[0]);
}));

// Edit a product's catalog details. Staff only.
router.patch('/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, category, sku, price, stock_qty, duration_days, description } = req.body;

  if (sku) {
    const existing = await pool.query('SELECT id FROM products WHERE sku = $1 AND id != $2', [sku, id]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A product with this SKU already exists' });
    }
  }

  const { rows } = await pool.query(
    `UPDATE products SET
       name = COALESCE($1, name),
       category = COALESCE($2, category),
       sku = COALESCE($3, sku),
       price = COALESCE($4, price),
       stock_qty = COALESCE($5, stock_qty),
       duration_days = COALESCE($6, duration_days),
       description = COALESCE($7, description)
     WHERE id = $8
     RETURNING id, name, category, sku, price, stock_qty, duration_days, description`,
    [name || null, category || null, sku || null, price ?? null, stock_qty ?? null, duration_days ?? null, description || null, id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(rows[0]);
}));

module.exports = router;

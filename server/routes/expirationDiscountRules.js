const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

function toList(value) {
  if (value == null) return null;
  return Array.isArray(value) ? value : String(value).split(',').map((v) => v.trim()).filter(Boolean);
}

function toIntList(value) {
  const list = toList(value);
  return list ? list.map(Number).filter((n) => !Number.isNaN(n)) : null;
}

// Staff-configurable expiration discount tiers. Staff/admin only -- these
// are never auto-created, and a product with no matching active rule gets
// no automatic discount.
router.get('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM expiration_discount_rules ORDER BY days_remaining_max ASC');
  res.json(rows);
}));

router.post('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { name, days_remaining_max, discount_percent, eligible_categories, eligible_brands, excluded_product_ids, active } = req.body;
  if (!name || days_remaining_max == null || discount_percent == null) {
    return res.status(400).json({ error: 'name, days_remaining_max and discount_percent are required' });
  }

  const { rows } = await pool.query(
    `INSERT INTO expiration_discount_rules (name, days_remaining_max, discount_percent, eligible_categories, eligible_brands, excluded_product_ids, active, created_by_staff_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [name, Number(days_remaining_max), Number(discount_percent), toList(eligible_categories), toList(eligible_brands), toIntList(excluded_product_ids), active ?? true, req.user.id]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, days_remaining_max, discount_percent, eligible_categories, eligible_brands, excluded_product_ids, active } = req.body;

  const { rows } = await pool.query(
    `UPDATE expiration_discount_rules SET
       name = COALESCE($1, name),
       days_remaining_max = COALESCE($2, days_remaining_max),
       discount_percent = COALESCE($3, discount_percent),
       eligible_categories = COALESCE($4, eligible_categories),
       eligible_brands = COALESCE($5, eligible_brands),
       excluded_product_ids = COALESCE($6, excluded_product_ids),
       active = COALESCE($7, active),
       updated_at = now()
     WHERE id = $8 RETURNING *`,
    [name || null, days_remaining_max ?? null, discount_percent ?? null, toList(eligible_categories), toList(eligible_brands), toIntList(excluded_product_ids), active ?? null, id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Rule not found' });
  }
  res.json(rows[0]);
}));

router.delete('/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM expiration_discount_rules WHERE id = $1', [id]);
  res.status(204).end();
}));

module.exports = router;

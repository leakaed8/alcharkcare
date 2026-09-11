const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { todayInBeirut } = require('../lib/beirutDate');
const { computeDaysUntilExpiration } = require('../lib/pricingEngine');

const router = express.Router();

const STATUSES = ['active', 'expired', 'discontinued'];

// Batches for staff's "Expiring soon" view. Staff/admin only. Optional
// ?within_days= filters to batches expiring within N days (from today,
// including already-expired); omit for the full list.
router.get('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { within_days, product_id } = req.query;
  const { rows } = await pool.query(
    `SELECT b.id, b.product_id, b.batch_number, b.quantity, b.expiration_date::text AS expiration_date, b.cost, b.status, b.created_at,
            p.name AS product_name, p.brand, p.category, p.image_url
     FROM batches b
     JOIN products p ON p.id = b.product_id
     WHERE ($1::int IS NULL OR b.product_id = $1)
     ORDER BY b.expiration_date ASC`,
    [product_id || null]
  );

  const today = todayInBeirut();
  const withDays = rows.map((b) => ({ ...b, days_until_expiration: computeDaysUntilExpiration(b.expiration_date, today) }));

  if (within_days) {
    const n = Number(within_days);
    return res.json(withDays.filter((b) => b.days_until_expiration != null && b.days_until_expiration <= n));
  }
  res.json(withDays);
}));

// Add a batch. Staff/admin only. Purely a tracking record -- does not
// touch products.stock_qty, which stays the single source of truth for
// available quantity.
router.post('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { product_id, batch_number, quantity, expiration_date, cost } = req.body;
  if (!product_id || !expiration_date) {
    return res.status(400).json({ error: 'product_id and expiration_date are required' });
  }
  const product = await pool.query('SELECT id FROM products WHERE id = $1', [product_id]);
  if (product.rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const { rows } = await pool.query(
    `INSERT INTO batches (product_id, batch_number, quantity, expiration_date, cost, created_by_staff_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, product_id, batch_number, quantity, expiration_date::text AS expiration_date, cost, status, created_at`,
    [product_id, batch_number || null, quantity == null || quantity === '' ? 0 : Number(quantity), expiration_date, cost === '' || cost == null ? null : cost, req.user.id]
  );
  res.status(201).json(rows[0]);
}));

// Update a batch (quantity, status, correction of expiration date/cost).
// Staff/admin only.
router.patch('/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { batch_number, quantity, expiration_date, cost, status } = req.body;
  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  }

  const { rows } = await pool.query(
    `UPDATE batches SET
       batch_number = COALESCE($1, batch_number),
       quantity = COALESCE($2, quantity),
       expiration_date = COALESCE($3, expiration_date),
       cost = COALESCE($4, cost),
       status = COALESCE($5, status)
     WHERE id = $6
     RETURNING id, product_id, batch_number, quantity, expiration_date::text AS expiration_date, cost, status, created_at`,
    [batch_number || null, quantity ?? null, expiration_date || null, cost ?? null, status || null, id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Batch not found' });
  }
  res.json(rows[0]);
}));

module.exports = router;

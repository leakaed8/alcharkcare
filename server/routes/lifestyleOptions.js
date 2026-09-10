const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

// Active options for the New Visit checklist. Any staff.
router.get('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, text FROM lifestyle_options WHERE active = true ORDER BY sort_order, text'
  );
  res.json(rows);
}));

// Full list (including inactive) for the admin management screen.
router.get('/all', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM lifestyle_options ORDER BY sort_order, text'
  );
  res.json(rows);
}));

router.post('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }
  const existing = await pool.query('SELECT id FROM lifestyle_options WHERE lower(text) = lower($1)', [text]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'That option already exists' });
  }
  const { rows } = await pool.query(
    `INSERT INTO lifestyle_options (text, sort_order, source) VALUES ($1, $2, 'manual') RETURNING *`,
    [text, req.body.sort_order ?? 0]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { text, active, sort_order } = req.body;
  const { rows } = await pool.query(
    `UPDATE lifestyle_options SET
       text = COALESCE($1, text),
       active = COALESCE($2, active),
       sort_order = COALESCE($3, sort_order)
     WHERE id = $4
     RETURNING *`,
    [text || null, active ?? null, sort_order ?? null, id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Lifestyle option not found' });
  }
  res.json(rows[0]);
}));

module.exports = router;

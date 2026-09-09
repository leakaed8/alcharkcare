const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

// List every lab test type, used both by the manual-entry dropdown (any
// signed-in user, staff or patient) and the management screen (staff).
router.get('/', verifyToken, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, key, label, unit, ref_low, ref_high, aliases FROM lab_test_types ORDER BY label'
  );
  res.json(rows);
}));

// Add a new test type to the dropdown. Staff only.
router.post('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { key, label, unit, ref_low, ref_high, aliases } = req.body;
  if (!key || !label || !unit) {
    return res.status(400).json({ error: 'key, label and unit are required' });
  }

  const normalizedKey = key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const existing = await pool.query('SELECT id FROM lab_test_types WHERE key = $1', [normalizedKey]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'A test type with this key already exists' });
  }

  const aliasList = Array.isArray(aliases)
    ? aliases
    : (aliases || '').split(',').map((a) => a.trim().toLowerCase()).filter(Boolean);
  if (!aliasList.includes(label.toLowerCase())) aliasList.push(label.toLowerCase());

  const { rows } = await pool.query(
    `INSERT INTO lab_test_types (key, label, unit, ref_low, ref_high, aliases)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, key, label, unit, ref_low, ref_high, aliases`,
    [normalizedKey, label, unit, ref_low === '' || ref_low == null ? null : ref_low, ref_high === '' || ref_high == null ? null : ref_high, aliasList]
  );
  res.status(201).json(rows[0]);
}));

// Edit a test type's label/unit/range/aliases. Staff only.
router.patch('/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid test type id' });
  }
  const { label, unit, ref_low, ref_high, aliases } = req.body;
  const aliasList = aliases == null
    ? null
    : Array.isArray(aliases)
      ? aliases
      : aliases.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean);

  const { rows } = await pool.query(
    `UPDATE lab_test_types SET
       label = COALESCE($1, label),
       unit = COALESCE($2, unit),
       ref_low = COALESCE($3, ref_low),
       ref_high = COALESCE($4, ref_high),
       aliases = COALESCE($5, aliases)
     WHERE id = $6
     RETURNING id, key, label, unit, ref_low, ref_high, aliases`,
    [label || null, unit || null, ref_low ?? null, ref_high ?? null, aliasList, id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Test type not found' });
  }
  res.json(rows[0]);
}));

module.exports = router;

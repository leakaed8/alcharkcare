const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

const SELECT_COLUMNS = `id, key, label, unit, ref_low, ref_high, aliases, category, specimen,
  routine_status, requires_clinical_context, is_active, description, alternative_units,
  nutrient_key, reference_range_type`;

// List every lab test type, used both by the manual-entry dropdown (any
// signed-in user, staff or patient) and the management screen (staff).
router.get('/', verifyToken, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT ${SELECT_COLUMNS} FROM lab_test_types ORDER BY label`);
  res.json(rows);
}));

// Add a new test type to the dropdown. Staff can add the basic catalog
// entry; it starts as NOT_ESTABLISHED/uncategorized until an admin
// reviews and classifies it (see PATCH below).
router.post('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { key, label, unit, ref_low, ref_high, aliases, specimen, description } = req.body;
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
    `INSERT INTO lab_test_types (key, label, unit, ref_low, ref_high, aliases, specimen, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${SELECT_COLUMNS}`,
    [normalizedKey, label, unit, ref_low === '' || ref_low == null ? null : ref_low, ref_high === '' || ref_high == null ? null : ref_high, aliasList, specimen || null, description || null]
  );
  res.status(201).json(rows[0]);
}));

// Edit a test type's basic catalog fields (label/unit/range/aliases/
// specimen/description). Staff or admin.
router.patch('/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid test type id' });
  }
  const { label, unit, ref_low, ref_high, aliases, specimen, description } = req.body;
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
       aliases = COALESCE($5, aliases),
       specimen = COALESCE($6, specimen),
       description = COALESCE($7, description)
     WHERE id = $8
     RETURNING ${SELECT_COLUMNS}`,
    [label || null, unit || null, ref_low ?? null, ref_high ?? null, aliasList, specimen || null, description || null, id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Test type not found' });
  }
  res.json(rows[0]);
}));

// Classify a test's role in the clinical rule engine (category, routine
// status, whether it needs patient context, its nutrient link, and which
// kind of reference range is in force). Admin only -- these fields change
// how the rule engine interprets every future result for this test.
router.patch('/:id/classification', verifyToken, requireRole('admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid test type id' });
  }
  const { category, routine_status, requires_clinical_context, is_active, nutrient_key, reference_range_type, alternative_units } = req.body;

  const validRoutineStatus = ['ROUTINE', 'SELECTIVE', 'SPECIALIZED', 'NOT_ROUTINE_SCREENING'];
  if (routine_status && !validRoutineStatus.includes(routine_status)) {
    return res.status(400).json({ error: `routine_status must be one of ${validRoutineStatus.join(', ')}` });
  }
  const validRefRangeType = ['LAB_PROVIDED', 'STANDARD_REFERENCE', 'CLINICAL_INTERPRETATION', 'NOT_ESTABLISHED'];
  if (reference_range_type && !validRefRangeType.includes(reference_range_type)) {
    return res.status(400).json({ error: `reference_range_type must be one of ${validRefRangeType.join(', ')}` });
  }

  const { rows } = await pool.query(
    `UPDATE lab_test_types SET
       category = COALESCE($1, category),
       routine_status = COALESCE($2, routine_status),
       requires_clinical_context = COALESCE($3, requires_clinical_context),
       is_active = COALESCE($4, is_active),
       nutrient_key = COALESCE($5, nutrient_key),
       reference_range_type = COALESCE($6, reference_range_type),
       alternative_units = COALESCE($7, alternative_units)
     WHERE id = $8
     RETURNING ${SELECT_COLUMNS}`,
    [
      category || null, routine_status || null, requires_clinical_context ?? null, is_active ?? null,
      nutrient_key || null, reference_range_type || null, alternative_units ? JSON.stringify(alternative_units) : null, id,
    ]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Test type not found' });
  }
  res.json(rows[0]);
}));

module.exports = router;

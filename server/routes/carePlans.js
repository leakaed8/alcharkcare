const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

function canView(req, patientId) {
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  return isStaff || String(req.user.id) === String(patientId);
}

function isValidId(id) {
  return /^\d+$/.test(String(id));
}

// A patient's care plans, most recent first, each with its linked visits.
// Staff can view any patient; a patient can only view their own.
router.get('/:patientId', verifyToken, asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  if (!isValidId(patientId)) {
    return res.status(400).json({ error: 'Invalid patient id' });
  }
  if (!canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';

  const { rows: plans } = await pool.query(
    `SELECT id, title, goal, status, start_date, target_end_date, created_at, updated_at
     FROM care_plans WHERE patient_id = $1 ORDER BY created_at DESC`,
    [patientId]
  );

  const withVisits = [];
  for (const plan of plans) {
    // `assessment` is the pharmacist's internal clinical judgment -- never
    // sent to the patient, even though this component doesn't currently
    // render it (the raw response is still inspectable client-side).
    const { rows: visits } = await pool.query(
      `SELECT v.id, v.visit_date, v.complaint, v.patient_summary, v.lifestyle_advice,
              ${isStaff ? 'v.assessment,' : ''}
              COALESCE(
                json_agg(
                  json_build_object('product_name', p.name, 'dosing_notes', vp.dosing_notes, 'status', vp.status)
                ) FILTER (WHERE vp.id IS NOT NULL AND (vp.patient_visible OR $2)), '[]'
              ) AS products
       FROM visits v
       LEFT JOIN visit_products vp ON vp.visit_id = v.id
       LEFT JOIN products p ON p.id = vp.product_id
       WHERE v.care_plan_id = $1
       GROUP BY v.id
       ORDER BY v.visit_date ASC`,
      [plan.id, isStaff]
    );
    withVisits.push({ ...plan, visits });
  }

  res.json(withVisits);
}));

// Start a new care plan for a patient. Staff only.
router.post('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { patient_id, title, goal, target_end_date } = req.body;
  if (!patient_id || !isValidId(patient_id) || !title) {
    return res.status(400).json({ error: 'patient_id and title are required' });
  }

  const { rows } = await pool.query(
    `INSERT INTO care_plans (patient_id, title, goal, target_end_date, created_by_staff_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, title, goal, status, start_date, target_end_date, created_at, updated_at`,
    [patient_id, title, goal || null, target_end_date || null, req.user.id]
  );
  res.status(201).json({ ...rows[0], visits: [] });
}));

// Adjust a care plan -- change its goal, status (e.g. mark completed/paused),
// or target date. This is how a plan is revised over time. Staff only.
router.patch('/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: 'Invalid care plan id' });
  }
  const { title, goal, status, target_end_date } = req.body;
  const validStatuses = ['active', 'completed', 'paused', 'cancelled'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${validStatuses.join(', ')}` });
  }

  const { rows } = await pool.query(
    `UPDATE care_plans SET
       title = COALESCE($1, title),
       goal = COALESCE($2, goal),
       status = COALESCE($3, status),
       target_end_date = COALESCE($4, target_end_date),
       updated_at = now()
     WHERE id = $5
     RETURNING id, title, goal, status, start_date, target_end_date, created_at, updated_at`,
    [title || null, goal || null, status || null, target_end_date || null, id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Care plan not found' });
  }
  res.json(rows[0]);
}));

module.exports = router;

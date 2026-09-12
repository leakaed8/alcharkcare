const express = require('express');
const pool = require('../db/pool');
const { verifyToken } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { notifyStaff } = require('../lib/staffNotify');

const router = express.Router();

function canView(req, patientId) {
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  return isStaff || String(req.user.id) === String(patientId);
}

// Ad-hoc activity log: "Mark done" on today's routine (Home) and "Report
// difficulty" (My Routine) both post here. There's no scheduled/automatic
// check-in anymore -- these are only ever a direct patient tap.
router.post('/', verifyToken, asyncHandler(async (req, res) => {
  const patientId = req.user.role === 'patient' ? req.user.id : Number(req.body.patient_id);
  if (!patientId || !canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { visit_product_id, response_value, notes } = req.body;
  if (!response_value) {
    return res.status(400).json({ error: 'response_value is required' });
  }

  const AD_HOC_MOOD = { good: 'Good', okay: 'Okay', difficulty: 'Having difficulty' };
  const responseLabel = AD_HOC_MOOD[response_value] || response_value;
  const isProblem = response_value === 'difficulty';

  const { rows: inserted } = await pool.query(
    `INSERT INTO checkins (patient_id, visit_product_id, response_value, response_label, is_problem, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [patientId, visit_product_id || null, response_value, responseLabel, isProblem, notes || null]
  );

  if (isProblem) {
    const { rows: patientRows } = await pool.query('SELECT name FROM patients WHERE id = $1', [patientId]);
    notifyStaff(
      `${patientRows[0]?.name || 'A patient'} reported a problem: "${responseLabel}"`,
      { title: 'Patient reported a problem', url: `/staff/patients/${patientId}` }
    ).catch((err) => console.error('Check-in notify error:', err.message));
  }

  res.status(201).json(inserted[0]);
}));

// A patient's check-in history. Staff can view any patient's; a patient
// can only view their own. Mirrors the /purchases/:patientId and
// /photos/:patientId pattern so PatientTimeline can fetch it the same way.
router.get('/:patientId', verifyToken, asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  if (!canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { rows } = await pool.query(
    `SELECT c.*, p.name AS product_name
     FROM checkins c
     LEFT JOIN visit_products vp ON vp.id = c.visit_product_id
     LEFT JOIN products p ON p.id = vp.product_id
     WHERE c.patient_id = $1
     ORDER BY c.created_at DESC`,
    [patientId]
  );
  res.json(rows);
}));

module.exports = router;

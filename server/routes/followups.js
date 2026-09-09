const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

// Follow-up dashboard: pending follow-ups with patient info, flagged as
// overdue (scheduled_date < today) or due (scheduled_date = today), plus
// escalated ones (response = 'worse'). Staff only.
router.get('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT f.id, f.scheduled_date, f.sent_date, f.response, f.patient_comment, f.staff_note, f.status,
            v.id AS visit_id, v.complaint, f.lab_result_id,
            p.id AS patient_id, p.name AS patient_name, p.phone AS patient_phone,
            CASE
              WHEN f.status != 'pending' THEN f.status
              WHEN f.scheduled_date < CURRENT_DATE THEN 'overdue'
              WHEN f.scheduled_date = CURRENT_DATE THEN 'due_today'
              ELSE 'upcoming'
            END AS dashboard_status
     FROM followups f
     LEFT JOIN visits v ON v.id = f.visit_id
     LEFT JOIN lab_results lr ON lr.id = f.lab_result_id
     JOIN patients p ON p.id = COALESCE(v.patient_id, lr.patient_id)
     WHERE f.status != 'closed'
     ORDER BY f.scheduled_date ASC`
  );
  res.json(rows);
}));

// Create a follow-up directly from a lab result (e.g. a repeat-test or
// "check with pharmacist" follow-up), for when there's no visit yet.
// Staff/admin only.
router.post('/from-lab-result', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { lab_result_id, scheduled_date, note } = req.body;
  if (!lab_result_id || !scheduled_date) {
    return res.status(400).json({ error: 'lab_result_id and scheduled_date are required' });
  }

  const labResult = await pool.query('SELECT id FROM lab_results WHERE id = $1', [lab_result_id]);
  if (labResult.rows.length === 0) {
    return res.status(404).json({ error: 'Lab result not found' });
  }

  const { rows } = await pool.query(
    `INSERT INTO followups (lab_result_id, scheduled_date, staff_note, logged_by_staff_id, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [lab_result_id, scheduled_date, note || null, req.user.id]
  );
  res.status(201).json(rows[0]);
}));

// Log a patient's follow-up response (e.g. after a staff-initiated WhatsApp check-in).
router.patch('/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid follow-up id' });
  }
  const { response, patient_comment, status } = req.body;

  const validResponses = ['better', 'same', 'worse', 'no_response'];
  if (response && !validResponses.includes(response)) {
    return res.status(400).json({ error: `response must be one of ${validResponses.join(', ')}` });
  }

  const { rows } = await pool.query(
    `UPDATE followups
     SET response = COALESCE($1, response),
         patient_comment = COALESCE($2, patient_comment),
         status = COALESCE($3, status),
         sent_date = COALESCE(sent_date, now()),
         logged_by_staff_id = $4
     WHERE id = $5
     RETURNING *`,
    [response || null, patient_comment || null, status || null, req.user.id, id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Follow-up not found' });
  }
  res.json(rows[0]);
}));

module.exports = router;

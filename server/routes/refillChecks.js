const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { notifyStaff } = require('../lib/staffNotify');

const router = express.Router();

const NO_REASONS = ['product_problem', 'too_expensive', 'switching_product', 'other'];

function canView(req, patientId) {
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  return isStaff || String(req.user.id) === String(patientId);
}

// The single pending refill prompt for this patient, if any -- shown as a
// card on Home. Created by the daily scheduled job (scheduledNotifier.js),
// not on request.
router.get('/due/:patientId', verifyToken, asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  if (!canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { rows } = await pool.query(
    `SELECT rc.id, rc.product_id, p.name AS product_name, p.image_url, rc.prompted_at
     FROM refill_checks rc
     JOIN products p ON p.id = rc.product_id
     WHERE rc.patient_id = $1 AND rc.response = 'pending'
     ORDER BY rc.prompted_at ASC LIMIT 1`,
    [patientId]
  );
  res.json(rows[0] || null);
}));

// Patient's answer: yes (wants a refill -- notifies staff), snooze (ask
// again in N days), or no (with a reason, also passed to staff so they can
// see why -- e.g. a pattern of "too expensive" on one product is useful to
// know, not just noise).
router.post('/:id/respond', verifyToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { response, snooze_days, no_reason, no_reason_note } = req.body;
  const validResponses = ['yes', 'snooze', 'no'];
  if (!validResponses.includes(response)) {
    return res.status(400).json({ error: `response must be one of ${validResponses.join(', ')}` });
  }
  if (response === 'no' && !NO_REASONS.includes(no_reason)) {
    return res.status(400).json({ error: `no_reason must be one of ${NO_REASONS.join(', ')}` });
  }

  const { rows: existingRows } = await pool.query(
    `SELECT rc.*, p.name AS product_name FROM refill_checks rc JOIN products p ON p.id = rc.product_id WHERE rc.id = $1`,
    [id]
  );
  const check = existingRows[0];
  if (!check) {
    return res.status(404).json({ error: 'Refill check not found' });
  }
  if (!canView(req, check.patient_id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (check.response !== 'pending') {
    return res.status(409).json({ error: 'This refill check was already answered' });
  }

  const { rows: patientRows } = await pool.query('SELECT name FROM patients WHERE id = $1', [check.patient_id]);
  const patientName = patientRows[0]?.name || 'A patient';

  if (response === 'yes') {
    await pool.query(
      `UPDATE refill_checks SET response = 'yes', responded_at = now() WHERE id = $1`,
      [id]
    );
    notifyStaff(`${patientName} needs a refill of ${check.product_name}.`, { title: 'Refill requested', url: '/staff/refill-requests' })
      .catch((err) => console.error('Refill notify error:', err.message));
  } else if (response === 'snooze') {
    const days = Math.max(1, Number(snooze_days) || 7);
    await pool.query(
      `UPDATE refill_checks SET response = 'snoozed', snooze_until = CURRENT_DATE + ($1 || ' days')::interval, responded_at = now() WHERE id = $2`,
      [days, id]
    );
  } else {
    await pool.query(
      `UPDATE refill_checks SET response = 'no', no_reason = $1, no_reason_note = $2, responded_at = now() WHERE id = $3`,
      [no_reason, no_reason_note || null, id]
    );
    notifyStaff(`${patientName} doesn't need a refill of ${check.product_name} (${no_reason.replace('_', ' ')}).`, { title: 'Refill declined', url: '/staff/refill-requests' })
      .catch((err) => console.error('Refill notify error:', err.message));
  }

  const { rows } = await pool.query('SELECT * FROM refill_checks WHERE id = $1', [id]);
  res.json(rows[0]);
}));

// Staff queue: every refill check, most recent first. Optional ?response=.
router.get('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { response } = req.query;
  const { rows } = await pool.query(
    `SELECT rc.*, p.name AS product_name, pt.name AS patient_name, pt.phone AS patient_phone
     FROM refill_checks rc
     JOIN products p ON p.id = rc.product_id
     JOIN patients pt ON pt.id = rc.patient_id
     WHERE ($1::text IS NULL OR rc.response = $1)
     ORDER BY rc.prompted_at DESC LIMIT 200`,
    [response || null]
  );
  res.json(rows);
}));

module.exports = router;

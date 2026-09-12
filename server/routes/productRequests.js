const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { pushToPatientById } = require('../lib/pushNotify');

const router = express.Router();

const VALID_STATUSES = ['requested', 'reviewing', 'ordered', 'available', 'not_available', 'fulfilled', 'cancelled'];

// Only the statuses a patient would actually want a ping for. 'requested'
// is the starting state, never something staff transition into.
const PRODUCT_REQUEST_STATUS_MESSAGES = {
  reviewing: "We're looking into the product you asked about.",
  ordered: 'Good news -- we ordered the product you asked about.',
  available: 'The product you asked about is now available!',
  not_available: "Unfortunately we couldn't source the product you asked about.",
  fulfilled: 'Your requested product is ready.',
  cancelled: 'Your product request was cancelled.',
};

function resolvePatientId(req) {
  if (req.user.role === 'patient') return req.user.id;
  const id = req.body.patient_id;
  return id ? Number(id) : null;
}

function canView(req, patientId) {
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  return isStaff || String(req.user.id) === String(patientId);
}

// "Ask Al Chark" -- a patient submits a product they couldn't find (or
// found but unavailable). Staff/admin can also log one on a patient's
// behalf (e.g. a phone call).
router.post('/', verifyToken, asyncHandler(async (req, res) => {
  const patientId = resolvePatientId(req);
  if (!patientId) {
    return res.status(400).json({ error: 'patient_id is required' });
  }
  if (!canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const requestedText = (req.body.requested_text || '').trim();
  if (!requestedText) {
    return res.status(400).json({ error: 'requested_text is required' });
  }
  if (req.body.matched_product_id && !/^\d+$/.test(String(req.body.matched_product_id))) {
    return res.status(400).json({ error: 'Invalid matched_product_id' });
  }

  const { rows } = await pool.query(
    `INSERT INTO product_requests (patient_id, requested_text, matched_product_id, location, source)
     VALUES ($1, $2, $3, $4, 'patient_portal')
     RETURNING *`,
    [patientId, requestedText, req.body.matched_product_id || null, req.body.location || null]
  );
  res.status(201).json(rows[0]);
}));

// Staff queue -- same pattern as Orders/Follow-ups. Optional ?status=.
router.get('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { status } = req.query;
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` });
  }
  const { rows } = await pool.query(
    `SELECT pr.*, p.name AS patient_name, p.phone AS patient_phone, mp.name AS matched_product_name
     FROM product_requests pr
     JOIN patients p ON p.id = pr.patient_id
     LEFT JOIN products mp ON mp.id = pr.matched_product_id
     WHERE ($1::text IS NULL OR pr.status = $1)
     ORDER BY pr.requested_at DESC`,
    [status || null]
  );
  res.json(rows);
}));

// A patient's own request history; staff/admin can view any patient's.
router.get('/:patientId', verifyToken, asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  if (!canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { rows } = await pool.query(
    `SELECT pr.*, mp.name AS matched_product_name
     FROM product_requests pr
     LEFT JOIN products mp ON mp.id = pr.matched_product_id
     WHERE pr.patient_id = $1
     ORDER BY pr.requested_at DESC`,
    [patientId]
  );
  res.json(rows);
}));

// Update a request's status/notes. Staff/admin only.
router.patch('/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid request id' });
  }
  const { status, notes, matched_product_id } = req.body;
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` });
  }

  const { rows: existingRows } = await pool.query('SELECT status FROM product_requests WHERE id = $1', [id]);
  const previousStatus = existingRows[0]?.status;

  const { rows } = await pool.query(
    `UPDATE product_requests SET
       status = COALESCE($1, status),
       notes = COALESCE($2, notes),
       matched_product_id = COALESCE($3, matched_product_id),
       updated_at = now()
     WHERE id = $4
     RETURNING *`,
    [status || null, notes || null, matched_product_id || null, id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Request not found' });
  }

  if (status && status !== previousStatus && PRODUCT_REQUEST_STATUS_MESSAGES[status]) {
    pushToPatientById(rows[0].patient_id, {
      title: 'Al Chark',
      body: PRODUCT_REQUEST_STATUS_MESSAGES[status],
      url: '/patient/find',
    }).catch((err) => console.error('Product request push error:', err.message));
  }
  res.json(rows[0]);
}));

module.exports = router;

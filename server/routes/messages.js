const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { notifyStaff } = require('../lib/staffNotify');
const { pushToPatientById } = require('../lib/pushNotify');

const router = express.Router();

const VALID_CATEGORIES = ['question', 'product_issue', 'routine_question', 'follow_up_request', 'general'];

function canView(req, patientId) {
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  return isStaff || String(req.user.id) === String(patientId);
}

// "Ask my pharmacist" -- a patient sends a message; staff can also reply
// through this same endpoint (sender='staff'). One flat thread per patient
// rather than nested conversations, matching how a real pharmacy counter
// conversation works.
router.post('/', verifyToken, asyncHandler(async (req, res) => {
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  const patientId = isStaff ? Number(req.body.patient_id) : req.user.id;
  if (!patientId || !canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const body = (req.body.body || '').trim();
  if (!body) {
    return res.status(400).json({ error: 'body is required' });
  }
  if (req.body.category && !VALID_CATEGORIES.includes(req.body.category)) {
    return res.status(400).json({ error: `category must be one of ${VALID_CATEGORIES.join(', ')}` });
  }

  const { rows } = await pool.query(
    `INSERT INTO messages (patient_id, sender, sender_staff_id, category, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [patientId, isStaff ? 'staff' : 'patient', isStaff ? req.user.id : null, req.body.category || 'general', body]
  );

  if (!isStaff) {
    const { rows: patientRows } = await pool.query('SELECT name FROM patients WHERE id = $1', [patientId]);
    notifyStaff(`New message from ${patientRows[0]?.name || 'a patient'}: "${body.slice(0, 80)}"`, {
      title: 'New patient message',
      url: '/staff/messages',
    }).catch((err) => console.error('Message notify error:', err.message));
  } else {
    pushToPatientById(patientId, {
      title: 'Al Chark',
      body: `New message from your pharmacist: "${body.slice(0, 80)}"`,
      url: '/patient/messages',
    }).catch((err) => console.error('Message push error:', err.message));
  }

  res.status(201).json(rows[0]);
}));

// The full thread for one patient. Staff can view any patient's; a
// patient only their own.
router.get('/:patientId', verifyToken, asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  if (!canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // Opening the thread marks the other side's unread messages as read --
  // a patient reading marks staff messages read, and vice versa. Runs
  // before the SELECT so this same response reflects the read receipt.
  const readerIsStaff = req.user.role === 'staff' || req.user.role === 'admin';
  await pool.query(
    `UPDATE messages SET read_at = now()
     WHERE patient_id = $1 AND read_at IS NULL AND sender = $2`,
    [patientId, readerIsStaff ? 'patient' : 'staff']
  );

  const { rows } = await pool.query(
    'SELECT * FROM messages WHERE patient_id = $1 ORDER BY created_at ASC',
    [patientId]
  );

  res.json(rows);
}));

// Staff inbox: one row per patient with an open conversation, most
// recently active first, with an unread count.
router.get('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT DISTINCT ON (p.id)
         p.id AS patient_id, p.name AS patient_name, p.phone AS patient_phone,
         m.body AS last_message, m.sender AS last_sender, m.created_at AS last_message_at,
         (SELECT COUNT(*) FROM messages m2 WHERE m2.patient_id = p.id AND m2.sender = 'patient' AND m2.read_at IS NULL) AS unread_count
       FROM messages m
       JOIN patients p ON p.id = m.patient_id
       ORDER BY p.id, m.created_at DESC
     ) latest
     ORDER BY last_message_at DESC`
  );
  res.json(rows);
}));

module.exports = router;

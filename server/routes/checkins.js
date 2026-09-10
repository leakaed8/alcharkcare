const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { findDueCheckin } = require('../lib/checkinEngine');
const { notifyStaff } = require('../lib/staffNotify');

const router = express.Router();

function canView(req, patientId) {
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  return isStaff || String(req.user.id) === String(patientId);
}

// 'Today' in the pharmacy's own timezone, not the server's -- Render runs
// UTC, and a day-offset check-in computed against UTC midnight would fire
// at the wrong local time for the patient.
function todayInBeirut() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Beirut', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function getMaxPerWeek() {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'checkin_frequency'");
  return rows[0]?.value?.max_per_week ?? 2;
}

// Which single check-in (if any) is due for this patient right now. Used
// by the patient Home screen's "Quick check-in" card.
router.get('/due/:patientId', verifyToken, asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  if (!canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows: questions } = await pool.query('SELECT * FROM checkin_questions WHERE active = true');

  const { rows: activeItems } = await pool.query(
    `SELECT vp.id AS visit_product_id, vp.product_id, p.category, vp.started_date::text AS started_date
     FROM visit_products vp
     JOIN visits v ON v.id = vp.visit_id
     JOIN products p ON p.id = vp.product_id
     WHERE v.patient_id = $1 AND vp.status = 'started' AND vp.started_date IS NOT NULL`,
    [patientId]
  );

  const { rows: answered } = await pool.query(
    `SELECT question_id, visit_product_id FROM checkins WHERE patient_id = $1 AND question_id IS NOT NULL`,
    [patientId]
  );
  const answeredKeys = new Set(answered.map((a) => `${a.question_id}:${a.visit_product_id ?? 'all'}`));

  const { rows: weekRows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM checkins WHERE patient_id = $1 AND created_at >= now() - interval '7 days'`,
    [patientId]
  );
  const maxPerWeek = await getMaxPerWeek();

  const due = findDueCheckin({
    questions,
    activeItems,
    answeredKeys,
    today: todayInBeirut(),
    checkinsThisWeek: weekRows[0].count,
    maxPerWeek,
  });

  if (!due) return res.json(null);

  const item = due.visitProductId ? activeItems.find((i) => i.visit_product_id === due.visitProductId) : null;
  res.json({
    question_id: due.question.id,
    text: due.question.text,
    response_type: due.question.response_type,
    options: due.question.options,
    visit_product_id: due.visitProductId,
    product_id: item?.product_id ?? null,
  });
}));

// Submit a check-in response. Either answers a specific due question
// (question_id set) or is an ad-hoc mood tap from Home with no particular
// question behind it (question_id omitted) -- both are stored the same way.
router.post('/', verifyToken, asyncHandler(async (req, res) => {
  const patientId = req.user.role === 'patient' ? req.user.id : Number(req.body.patient_id);
  if (!patientId || !canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { question_id, visit_product_id, response_value, notes } = req.body;
  if (!response_value) {
    return res.status(400).json({ error: 'response_value is required' });
  }

  let responseLabel = null;
  let isProblem = false;

  if (question_id) {
    const { rows } = await pool.query('SELECT * FROM checkin_questions WHERE id = $1', [question_id]);
    const question = rows[0];
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    const option = (question.options || []).find((o) => o.value === response_value);
    responseLabel = option?.label || response_value;
    isProblem = option?.is_problem || false;
  } else {
    // Ad-hoc quick check-in: a fixed, small mood vocabulary.
    const AD_HOC_MOOD = { good: 'Good', okay: 'Okay', difficulty: 'Having difficulty' };
    responseLabel = AD_HOC_MOOD[response_value] || response_value;
    isProblem = response_value === 'difficulty';
  }

  const { rows: inserted } = await pool.query(
    `INSERT INTO checkins (patient_id, question_id, visit_product_id, response_value, response_label, is_problem, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [patientId, question_id || null, visit_product_id || null, response_value, responseLabel, isProblem, notes || null]
  );

  if (isProblem) {
    const { rows: patientRows } = await pool.query('SELECT name FROM patients WHERE id = $1', [patientId]);
    notifyStaff(
      `${patientRows[0]?.name || 'A patient'} reported a problem in a check-in: "${responseLabel}"`,
      { title: 'Patient reported a problem', url: '/staff/checkins' }
    ).catch((err) => console.error('Check-in notify error:', err.message));
  }

  res.status(201).json(inserted[0]);
}));

// A patient's check-in history (used by My Progress and the staff patient
// profile). Staff can view any patient's; a patient only their own.
router.get('/:patientId', verifyToken, asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  if (!canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { rows } = await pool.query(
    `SELECT c.*, q.text AS question_text
     FROM checkins c
     LEFT JOIN checkin_questions q ON q.id = c.question_id
     WHERE c.patient_id = $1
     ORDER BY c.created_at DESC`,
    [patientId]
  );
  res.json(rows);
}));

// Staff-wide feed of reported problems, most recent first -- the "problem
// alerts" surfaced on the staff dashboard. Optional ?unacknowledged=true.
router.get('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const onlyUnacknowledged = req.query.unacknowledged === 'true';
  const { rows } = await pool.query(
    `SELECT c.*, q.text AS question_text, p.name AS patient_name, p.phone AS patient_phone
     FROM checkins c
     LEFT JOIN checkin_questions q ON q.id = c.question_id
     JOIN patients p ON p.id = c.patient_id
     WHERE c.is_problem = true AND ($1::boolean IS FALSE OR c.staff_acknowledged = false)
     ORDER BY c.created_at DESC
     LIMIT 100`,
    [onlyUnacknowledged]
  );
  res.json(rows);
}));

router.patch('/:id/acknowledge', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    'UPDATE checkins SET staff_acknowledged = true WHERE id = $1 RETURNING *',
    [id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Check-in not found' });
  }
  res.json(rows[0]);
}));

// Staff management of the check-in question bank.
router.get('/questions/all', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM checkin_questions ORDER BY day_offset, id');
  res.json(rows);
}));

router.post('/questions', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { text, day_offset, target_scope, target_product_id, target_category, response_type, options } = req.body;
  if (!text || day_offset == null) {
    return res.status(400).json({ error: 'text and day_offset are required' });
  }
  const validScopes = ['all', 'product', 'category'];
  if (target_scope && !validScopes.includes(target_scope)) {
    return res.status(400).json({ error: `target_scope must be one of ${validScopes.join(', ')}` });
  }
  const { rows } = await pool.query(
    `INSERT INTO checkin_questions (text, day_offset, target_scope, target_product_id, target_category, response_type, options, created_by_staff_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [text, day_offset, target_scope || 'all', target_product_id || null, target_category || null, response_type || 'mood', JSON.stringify(options || []), req.user.id]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/questions/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { text, day_offset, target_scope, target_product_id, target_category, response_type, options, active } = req.body;
  const { rows } = await pool.query(
    `UPDATE checkin_questions SET
       text = COALESCE($1, text),
       day_offset = COALESCE($2, day_offset),
       target_scope = COALESCE($3, target_scope),
       target_product_id = COALESCE($4, target_product_id),
       target_category = COALESCE($5, target_category),
       response_type = COALESCE($6, response_type),
       options = COALESCE($7, options),
       active = COALESCE($8, active)
     WHERE id = $9
     RETURNING *`,
    [text || null, day_offset ?? null, target_scope || null, target_product_id ?? null, target_category || null, response_type || null, options ? JSON.stringify(options) : null, active ?? null, id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Question not found' });
  }
  res.json(rows[0]);
}));

module.exports = router;

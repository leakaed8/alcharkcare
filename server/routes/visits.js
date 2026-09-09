const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

const VALID_PRODUCT_STATUSES = ['recommended', 'started', 'completed', 'cancelled'];

// Log a visit. Staff only.
// Body: { patient_id, care_plan_id, complaint, assessment, patient_summary,
//         lifestyle_advice, next_followup_date, photo_urls,
//         products: [{ product_id, is_supplement, dosing_notes, reason, status }] }
router.post('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const {
    patient_id,
    care_plan_id,
    complaint,
    assessment,
    patient_summary,
    lifestyle_advice,
    next_followup_date,
    photo_urls,
    products,
  } = req.body;

  if (!patient_id || !/^\d+$/.test(String(patient_id))) {
    return res.status(400).json({ error: 'A valid patient_id is required' });
  }
  if (care_plan_id && !/^\d+$/.test(String(care_plan_id))) {
    return res.status(400).json({ error: 'Invalid care_plan_id' });
  }

  const patientExists = await pool.query('SELECT id FROM patients WHERE id = $1', [patient_id]);
  if (patientExists.rows.length === 0) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const visitResult = await client.query(
      `INSERT INTO visits (patient_id, staff_id, care_plan_id, complaint, assessment, patient_summary, lifestyle_advice, photo_urls, next_followup_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, visit_date`,
      [
        patient_id,
        req.user.id,
        care_plan_id || null,
        complaint || null,
        assessment || null,
        patient_summary || null,
        lifestyle_advice || null,
        photo_urls || null,
        next_followup_date || null,
      ]
    );
    const visit = visitResult.rows[0];

    for (const item of products || []) {
      const status = VALID_PRODUCT_STATUSES.includes(item.status) ? item.status : 'recommended';
      await client.query(
        `INSERT INTO visit_products (visit_id, product_id, is_supplement, dosing_notes, reason, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [visit.id, item.product_id, item.is_supplement || false, item.dosing_notes || null, item.reason || null, status]
      );
    }

    if (next_followup_date) {
      await client.query(
        `INSERT INTO followups (visit_id, scheduled_date, status)
         VALUES ($1, $2, 'pending')`,
        [visit.id, next_followup_date]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ id: visit.id, visit_date: visit.visit_date });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Update a recommended product's lifecycle (e.g. mark it started once the
// patient has begun using it, or completed/cancelled). Staff/admin can set
// any status on any visit_product. A patient can only mark their OWN
// recommendation as "started" -- this is the "I'm using this" action in
// the portal -- never any other transition, and ownership is verified
// server-side via the visit, not trusted from the request.
router.patch('/products/:id', verifyToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid visit product id' });
  }
  const { status, started_date } = req.body;
  if (status && !VALID_PRODUCT_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${VALID_PRODUCT_STATUSES.join(', ')}` });
  }

  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  if (!isStaff) {
    if (status && status !== 'started') {
      return res.status(403).json({ error: 'Patients can only mark a recommendation as started' });
    }
    const owns = await pool.query(
      `SELECT vp.id FROM visit_products vp JOIN visits v ON v.id = vp.visit_id
       WHERE vp.id = $1 AND v.patient_id = $2 AND vp.patient_visible = true`,
      [id, req.user.id]
    );
    if (owns.rows.length === 0) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  const { rows } = await pool.query(
    `UPDATE visit_products SET
       status = COALESCE($1, status),
       started_date = CASE WHEN $1 = 'started' AND started_date IS NULL THEN COALESCE($2, CURRENT_DATE) ELSE COALESCE($2, started_date) END
     WHERE id = $3
     RETURNING *`,
    [status || null, started_date || null, id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Visit product not found' });
  }
  res.json(rows[0]);
}));

module.exports = router;

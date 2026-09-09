const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

function isValidId(id) {
  return /^\d+$/.test(id);
}

// Search patients by name or phone. Staff only.
router.get('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    const { rows } = await pool.query(
      'SELECT id, name, phone, loyalty_tier FROM patients ORDER BY created_at DESC LIMIT 25'
    );
    return res.json(rows);
  }

  const { rows } = await pool.query(
    `SELECT id, name, phone, loyalty_tier FROM patients
     WHERE name ILIKE $1 OR phone ILIKE $1
     ORDER BY name LIMIT 25`,
    [`%${q}%`]
  );
  res.json(rows);
}));

// Create a patient. Staff only (self-service signup lives in /api/auth/patient/signup).
router.post('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { name, phone, pin, dob, skin_type, hair_type, allergies, conditions, pregnancy_flag } = req.body;
  if (!name || !phone || !pin) {
    return res.status(400).json({ error: 'name, phone and pin are required' });
  }
  if (!/^\d{4,6}$/.test(pin)) {
    return res.status(400).json({ error: 'pin must be 4-6 digits' });
  }

  const existing = await pool.query('SELECT id FROM patients WHERE phone = $1', [phone]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'A patient with this phone number already exists' });
  }

  const pinHash = await bcrypt.hash(pin, 10);
  const { rows } = await pool.query(
    `INSERT INTO patients (name, phone, pin_hash, dob, skin_type, hair_type, allergies, conditions, pregnancy_flag)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, name, phone, loyalty_tier`,
    [
      name,
      phone,
      pinHash,
      dob || null,
      skin_type || null,
      hair_type || null,
      allergies || null,
      conditions || null,
      pregnancy_flag || false,
    ]
  );
  res.status(201).json(rows[0]);
}));

const VALID_CONTACT_METHODS = ['phone', 'whatsapp', 'sms', 'email'];

// Update a patient's profile. Staff can edit clinical/account fields
// (allergies, skin type, etc). A patient hitting their own record can only
// ever change preferred_contact_method -- every other field is silently
// ignored for them rather than trusted from the request body.
router.patch('/:id', verifyToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: 'Invalid patient id' });
  }
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  if (!isStaff && String(req.user.id) !== String(id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { name, dob, skin_type, hair_type, allergies, conditions, pregnancy_flag, preferred_contact_method } = req.body;
  if (preferred_contact_method && !VALID_CONTACT_METHODS.includes(preferred_contact_method)) {
    return res.status(400).json({ error: `preferred_contact_method must be one of ${VALID_CONTACT_METHODS.join(', ')}` });
  }

  const { rows } = await pool.query(
    `UPDATE patients SET
       name = COALESCE($1, name),
       dob = COALESCE($2, dob),
       skin_type = COALESCE($3, skin_type),
       hair_type = COALESCE($4, hair_type),
       allergies = COALESCE($5, allergies),
       conditions = COALESCE($6, conditions),
       pregnancy_flag = COALESCE($7, pregnancy_flag),
       preferred_contact_method = COALESCE($8, preferred_contact_method)
     WHERE id = $9
     RETURNING id, name, phone, dob, skin_type, hair_type, allergies, conditions, pregnancy_flag, preferred_contact_method, loyalty_tier`,
    [
      isStaff ? (name || null) : null,
      isStaff ? (dob || null) : null,
      isStaff ? (skin_type || null) : null,
      isStaff ? (hair_type || null) : null,
      isStaff ? (allergies || null) : null,
      isStaff ? (conditions || null) : null,
      isStaff ? (pregnancy_flag ?? null) : null,
      preferred_contact_method || null,
      id,
    ]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Patient not found' });
  }
  res.json(rows[0]);
}));

// Patient timeline: patient profile + visits (with products) + followups.
// Staff can view any patient; a patient can only view their own record.
router.get('/:id', verifyToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: 'Invalid patient id' });
  }
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  if (!isStaff && String(req.user.id) !== String(id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const patientResult = await pool.query(
    `SELECT id, name, phone, dob, skin_type, hair_type, allergies, conditions,
            pregnancy_flag, purchase_total_lifetime, purchase_total_rolling_12mo, loyalty_tier,
            preferred_contact_method
     FROM patients WHERE id = $1`,
    [id]
  );
  const patient = patientResult.rows[0];
  if (!patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  // `assessment` is the pharmacist's internal clinical judgment -- never
  // sent to the patient. `patient_summary` (optionally filled in by staff
  // per visit) is what a patient sees instead; complaint and lifestyle
  // advice are things said to/given directly to the patient already, so
  // those stay visible. This is enforced here, server-side, not just left
  // to the UI to hide.
  const visitsResult = await pool.query(
    `SELECT v.id, v.visit_date, v.complaint, v.patient_summary, v.lifestyle_advice,
            ${isStaff ? 'v.assessment,' : ''}
            v.photo_urls, v.next_followup_date, v.care_plan_id, s.name AS staff_name,
            COUNT(vp.id) FILTER (WHERE vp.status = 'started') AS started_count,
            COUNT(vp.id) FILTER (WHERE vp.status = 'recommended') AS recommended_count,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', vp.id,
                  'product_id', vp.product_id,
                  'product_name', p.name,
                  'is_supplement', vp.is_supplement,
                  'dosing_notes', vp.dosing_notes,
                  'status', vp.status,
                  'reason', vp.reason,
                  'started_date', vp.started_date
                ) ORDER BY vp.id
              ) FILTER (WHERE vp.id IS NOT NULL AND (vp.patient_visible OR $2)), '[]'
            ) AS products
     FROM visits v
     LEFT JOIN staff s ON s.id = v.staff_id
     LEFT JOIN visit_products vp ON vp.visit_id = v.id
     LEFT JOIN products p ON p.id = vp.product_id
     WHERE v.patient_id = $1
     GROUP BY v.id, s.name
     ORDER BY v.visit_date DESC`,
    [id, isStaff]
  );

  // LEFT JOINs so a follow-up created directly from a lab result (no visit
  // yet) still shows up for the patient, not just visit-driven ones.
  const followupsResult = await pool.query(
    `SELECT f.id, f.visit_id, f.lab_result_id, f.scheduled_date, f.sent_date, f.response,
            f.patient_comment, f.status
     FROM followups f
     LEFT JOIN visits v ON v.id = f.visit_id
     LEFT JOIN lab_results lr ON lr.id = f.lab_result_id
     WHERE COALESCE(v.patient_id, lr.patient_id) = $1
     ORDER BY f.scheduled_date DESC`,
    [id]
  );

  res.json({ patient, visits: visitsResult.rows, followups: followupsResult.rows });
}));

module.exports = router;

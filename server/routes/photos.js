const express = require('express');
const pool = require('../db/pool');
const { verifyToken } = require('../middleware/auth');
const upload = require('../lib/photoUpload');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

function isValidId(id) {
  return /^\d+$/.test(String(id));
}

function canView(req, patientId) {
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  return isStaff || String(req.user.id) === String(patientId);
}

function resolvePatientId(req) {
  if (req.user.role === 'patient') return req.user.id;
  const id = req.body.patient_id;
  return id && isValidId(id) ? Number(id) : null;
}

// Upload a before/after progress photo. Unlike lab/invoice scanning, this
// photo IS kept -- that's the point of a before/after comparison -- stored
// as the image itself (base64) rather than through any third-party host.
// Patients can upload their own; staff can upload for any patient.
router.post('/', verifyToken, upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'image is required' });
  }
  const patientId = resolvePatientId(req);
  if (!patientId) {
    return res.status(400).json({ error: 'patient_id is required' });
  }
  if (!canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { visit_id, body_area, notes, category } = req.body;
  const validCategories = ['acne', 'pigmentation', 'redness', 'texture', 'hair', 'skin', 'other'];
  if (category && !validCategories.includes(category)) {
    return res.status(400).json({ error: `category must be one of ${validCategories.join(', ')}` });
  }
  const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  const uploadedBy = req.user.role === 'patient' ? 'patient' : 'staff';

  const { rows } = await pool.query(
    `INSERT INTO progress_photos (patient_id, visit_id, photo_url, body_area, category, uploaded_by, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, taken_date, body_area, category, uploaded_by, notes`,
    [patientId, visit_id && isValidId(visit_id) ? visit_id : null, dataUri, body_area || null, category || null, uploadedBy, notes || null]
  );
  res.status(201).json(rows[0]);
}));

// Photo history for a patient, most recent first. Staff/admin can view any
// patient; a patient can only view their own.
router.get('/:patientId', verifyToken, asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  if (!isValidId(patientId)) {
    return res.status(400).json({ error: 'Invalid patient id' });
  }
  if (!canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    `SELECT id, visit_id, photo_url, body_area, category, taken_date, uploaded_by, notes
     FROM progress_photos WHERE patient_id = $1 ORDER BY taken_date DESC, id DESC`,
    [patientId]
  );
  res.json(rows);
}));

// Delete a photo. Staff can delete any; a patient can only delete their own.
router.delete('/:id', verifyToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ error: 'Invalid photo id' });
  }

  const existing = await pool.query('SELECT patient_id FROM progress_photos WHERE id = $1', [id]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: 'Photo not found' });
  }
  if (!canView(req, existing.rows[0].patient_id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await pool.query('DELETE FROM progress_photos WHERE id = $1', [id]);
  res.status(204).end();
}));

module.exports = router;

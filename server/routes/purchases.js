const express = require('express');
const pool = require('../db/pool');
const { verifyToken } = require('../middleware/auth');
const upload = require('../lib/upload');
const { extractText } = require('../lib/ocr');
const { extractCandidateLines, matchAgainstCatalog } = require('../lib/purchaseParser');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

function resolvePatientId(req) {
  if (req.user.role === 'patient') return req.user.id;
  const id = req.body.patient_id;
  return id ? Number(id) : null;
}

function canView(req, patientId) {
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  return isStaff || String(req.user.id) === String(patientId);
}

// Scan a product label or a sales invoice photo: OCR it and propose product
// name(s) matched against the catalog for the caller to confirm. The image
// itself is discarded after this -- only text ever gets stored.
router.post('/scan', verifyToken, upload.single('image'), asyncHandler(async (req, res) => {
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

  const rawText = await extractText(req.file.buffer);
  const candidateLines = extractCandidateLines(rawText);

  const { rows: products } = await pool.query('SELECT id, name FROM products');
  const candidates = candidateLines.map((line) => matchAgainstCatalog(line, products));

  res.json({ candidates });
}));

// Confirm one or more scanned items into a patient's purchase history.
// Only product names are stored -- never the photo.
router.post('/confirm', verifyToken, asyncHandler(async (req, res) => {
  const patientId = req.user.role === 'patient' ? req.user.id : Number(req.body.patient_id);
  if (!patientId) {
    return res.status(400).json({ error: 'patient_id is required' });
  }
  if (!canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const items = (req.body.items || []).filter((item) => item.product_name && item.product_name.trim());
  if (items.length === 0) {
    return res.status(400).json({ error: 'items is required' });
  }

  for (const item of items) {
    await pool.query(
      `INSERT INTO purchases (patient_id, product_id, product_name, logged_by_staff_id)
       VALUES ($1, $2, $3, $4)`,
      [patientId, item.product_id || null, item.product_name.trim(), req.user.role === 'patient' ? null : req.user.id]
    );
  }

  const { rows } = await pool.query(
    `SELECT id, product_name, purchased_at FROM purchases WHERE patient_id = $1 ORDER BY purchased_at DESC`,
    [patientId]
  );
  res.status(201).json(rows);
}));

// Purchase history for a patient (product names only). Staff/admin can view
// any patient; a patient can only view their own.
router.get('/:patientId', verifyToken, asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  if (!canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    `SELECT id, product_name, purchased_at FROM purchases WHERE patient_id = $1 ORDER BY purchased_at DESC`,
    [patientId]
  );
  res.json(rows);
}));

module.exports = router;

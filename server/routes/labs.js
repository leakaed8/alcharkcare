const express = require('express');
const pool = require('../db/pool');
const { verifyToken } = require('../middleware/auth');
const upload = require('../lib/upload');
const { extractText } = require('../lib/ocr');
const { parseLabText } = require('../lib/labParser');
const { findByKey } = require('../lib/nutrients');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

function resolvePatientId(req) {
  if (req.user.role === 'patient') return req.user.id;
  const id = req.body.patient_id || req.query.patient_id;
  return id ? Number(id) : null;
}

function canView(req, patientId) {
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  return isStaff || String(req.user.id) === String(patientId);
}

// Products supplying a given nutrient that this patient has actually taken
// (via a logged visit or a scanned purchase), for the "is it helping" insight.
async function findSourcingProducts(patientId, nutrientKey) {
  const { rows } = await pool.query(
    `SELECT DISTINCT product_name FROM (
       SELECT p.name AS product_name
       FROM visit_products vp
       JOIN visits v ON v.id = vp.visit_id
       JOIN products p ON p.id = vp.product_id
       JOIN product_nutrients pn ON pn.product_id = p.id
       WHERE v.patient_id = $1 AND pn.nutrient_key = $2
       UNION
       SELECT pu.product_name
       FROM purchases pu
       JOIN product_nutrients pn ON pn.product_id = pu.product_id
       WHERE pu.patient_id = $1 AND pn.nutrient_key = $2
     ) t`,
    [patientId, nutrientKey]
  );
  return rows.map((r) => r.product_name);
}

function buildInsight(marker, sourcingProducts) {
  if (sourcingProducts.length === 0) {
    return `No product on file supplies ${marker.label}. This reading is informational only -- not medical advice.`;
  }
  const products = sourcingProducts.join(', ');
  if (marker.flag === 'normal') {
    return `${products} may be helping -- ${marker.label} is within the general reference range. Informational only, not medical advice.`;
  }
  if (marker.flag === 'low') {
    return `Still low despite taking ${products} -- worth reviewing dosage/adherence with staff. Informational only, not medical advice.`;
  }
  if (marker.flag === 'high') {
    return `${marker.label} is above the general reference range while taking ${products} -- worth a staff review. Informational only, not medical advice.`;
  }
  return `Could not determine whether ${products} is helping from this reading.`;
}

async function annotate(patientId, markers) {
  const annotated = [];
  for (const marker of markers) {
    const sourcingProducts = await findSourcingProducts(patientId, marker.nutrient_key);
    annotated.push({ ...marker, sourcing_products: sourcingProducts, insight: buildInsight(marker, sourcingProducts) });
  }
  return annotated;
}

// Scan a lab-result photo: OCR it, parse known markers, store the extracted
// text + markers (never the image), and return an insight per marker.
// Patients can scan their own; staff/admin can scan for any patient.
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
  const markers = parseLabText(rawText);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const labResult = await client.query(
      `INSERT INTO lab_results (patient_id, scanned_by_staff_id, raw_text)
       VALUES ($1, $2, $3) RETURNING id, scanned_at`,
      [patientId, req.user.role === 'patient' ? null : req.user.id, rawText]
    );
    for (const m of markers) {
      await client.query(
        `INSERT INTO lab_result_markers (lab_result_id, nutrient_key, value, unit, flag)
         VALUES ($1, $2, $3, $4, $5)`,
        [labResult.rows[0].id, m.nutrient_key, m.value, m.unit, m.flag]
      );
    }
    await client.query('COMMIT');

    const annotatedMarkers = await annotate(patientId, markers);
    res.status(201).json({
      id: labResult.rows[0].id,
      scanned_at: labResult.rows[0].scanned_at,
      raw_text: rawText,
      markers: annotatedMarkers,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Lab scan history for a patient (most recent first). Staff/admin can view
// any patient; a patient can only view their own.
router.get('/:patientId', verifyToken, asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  if (!canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows: results } = await pool.query(
    `SELECT id, scanned_at FROM lab_results WHERE patient_id = $1 ORDER BY scanned_at DESC`,
    [patientId]
  );

  const withMarkers = [];
  for (const result of results) {
    const { rows: markerRows } = await pool.query(
      `SELECT nutrient_key, value, unit, flag FROM lab_result_markers WHERE lab_result_id = $1`,
      [result.id]
    );
    const markers = markerRows.map((m) => {
      const nutrient = findByKey(m.nutrient_key);
      return { ...m, label: nutrient?.label || m.nutrient_key, ref_low: nutrient?.refLow, ref_high: nutrient?.refHigh };
    });
    withMarkers.push({ ...result, markers: await annotate(patientId, markers) });
  }

  res.json(withMarkers);
}));

module.exports = router;

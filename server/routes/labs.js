const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const upload = require('../lib/upload');
const { extractText } = require('../lib/ocr');
const { parseLabText } = require('../lib/labParser');
const { flagFor } = require('../lib/nutrients');
const { interpretResult, convertUnit } = require('../lib/labRuleEngine');
const { writeLabAudit } = require('../lib/labAudit');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

const PHARMACIST_DISCLAIMER = 'This clinical decision-support information is intended to assist qualified healthcare professionals. It does not replace professional clinical judgment, diagnosis, or treatment. Laboratory reference ranges and interpretation may vary by laboratory, assay, patient characteristics, and clinical context.';
const PATIENT_DISCLAIMER = 'Laboratory results should be interpreted together with your healthcare professional. This information does not constitute a medical diagnosis or treatment plan.';

function resolvePatientId(req) {
  if (req.user.role === 'patient') return req.user.id;
  const id = req.body.patient_id || req.query.patient_id;
  return id ? Number(id) : null;
}

function canView(req, patientId) {
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  return isStaff || String(req.user.id) === String(patientId);
}

function disclaimerFor(req) {
  return req.user.role === 'patient' ? PATIENT_DISCLAIMER : PHARMACIST_DISCLAIMER;
}

function ageFromDob(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

async function getTestTypes() {
  const { rows } = await pool.query(
    `SELECT key, label, unit, ref_low, ref_high, aliases, category, specimen, routine_status,
            requires_clinical_context, nutrient_key, reference_range_type, alternative_units
     FROM lab_test_types WHERE is_active = true`
  );
  return rows;
}

async function getActiveRules(testKeys) {
  if (testKeys.length === 0) return {};
  const { rows } = await pool.query(
    `SELECT * FROM lab_interpretation_rules WHERE lab_test_key = ANY($1) AND active = true`,
    [testKeys]
  );
  const byKey = {};
  for (const r of rows) {
    (byKey[r.lab_test_key] = byKey[r.lab_test_key] || []).push(r);
  }
  return byKey;
}

async function getRelatedTests(testKeys) {
  if (testKeys.length === 0) return {};
  const { rows } = await pool.query(
    `SELECT lab_test_key, related_lab_test_key, relationship_type, description
     FROM lab_test_relations WHERE lab_test_key = ANY($1)`,
    [testKeys]
  );
  const byKey = {};
  for (const r of rows) {
    (byKey[r.lab_test_key] = byKey[r.lab_test_key] || []).push({
      test_key: r.related_lab_test_key,
      relationship_type: r.relationship_type,
      description: r.description,
    });
  }
  return byKey;
}

async function getSafetyFlags(nutrientKeys, testKeys) {
  if (nutrientKeys.length === 0 && testKeys.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT * FROM lab_safety_flags WHERE active = true AND (nutrient_key = ANY($1) OR lab_test_key = ANY($2))`,
    [nutrientKeys, testKeys]
  );
  return rows;
}

// Recommendations are never auto-applied anywhere (never added to a cart,
// never turned into a prescription) -- they're read-only suggested text a
// pharmacist can choose to log as a note via PATCH /:markerId below.
async function getRecommendationRules(nutrientKeys) {
  if (nutrientKeys.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT * FROM supplement_recommendation_rules WHERE active = true AND nutrient_key = ANY($1)`,
    [nutrientKeys]
  );
  return rows;
}

function recommendationsForMarker(allRecs, testType, nutritionalStatus) {
  if (!testType?.nutrient_key) return [];
  return allRecs
    .filter((r) => r.nutrient_key === testType.nutrient_key && (r.trigger_severity === 'ANY' || r.trigger_severity === nutritionalStatus))
    .map((r) => ({
      recommendation_type: r.recommendation_type,
      recommendation_text: r.recommendation_text,
      safety_warning: r.safety_warning,
      requires_pharmacist_review: r.requires_pharmacist_review,
      requires_physician_review: r.requires_physician_review,
    }));
}

// Live-derived clinical context: the patient's sex/age/pregnancy for the
// rule engine, plus the most recent eGFR/creatinine/CRP on file. We never
// bake an invented cutoff (e.g. "eGFR < 60 = impaired") into the engine --
// the actual numbers are surfaced alongside any renal/inflammation safety
// caveat so the pharmacist can judge, rather than a hidden threshold
// silently deciding for them.
async function getPatientClinicalContext(patientId) {
  const { rows: patientRows } = await pool.query('SELECT dob, sex, pregnancy_flag FROM patients WHERE id = $1', [patientId]);
  const p = patientRows[0] || {};

  const { rows: recent } = await pool.query(
    `SELECT lrm.nutrient_key, lrm.value, COALESCE(lrm.test_date, lr.scanned_at::date) AS as_of
     FROM lab_result_markers lrm
     JOIN lab_results lr ON lr.id = lrm.lab_result_id
     WHERE lr.patient_id = $1 AND lrm.nutrient_key IN ('egfr', 'creatinine', 'crp')
     ORDER BY as_of DESC NULLS LAST`,
    [patientId]
  );
  const latest = {};
  for (const r of recent) {
    if (!latest[r.nutrient_key]) latest[r.nutrient_key] = { value: r.value, as_of: r.as_of };
  }

  return {
    sex: p.sex || null,
    ageYears: ageFromDob(p.dob),
    pregnant: p.pregnancy_flag === true,
    recent_egfr: latest.egfr || null,
    recent_creatinine: latest.creatinine || null,
    recent_crp: latest.crp || null,
  };
}

function safetyFlagsForMarker(allFlags, testType, clinicalContext) {
  const relevant = allFlags.filter((f) => f.lab_test_key === testType.key || (testType.nutrient_key && f.nutrient_key === testType.nutrient_key));
  return relevant.map((f) => {
    let warningText = f.warning_text;
    if (f.condition_type === 'RENAL_IMPAIRMENT' && clinicalContext.recent_egfr) {
      warningText += ` (Recent eGFR on file: ${clinicalContext.recent_egfr.value} as of ${clinicalContext.recent_egfr.as_of}.)`;
    }
    if (f.condition_type === 'INFLAMMATION' && clinicalContext.recent_crp) {
      warningText += ` (Recent CRP on file: ${clinicalContext.recent_crp.value} as of ${clinicalContext.recent_crp.as_of}.)`;
    }
    return { condition_type: f.condition_type, warning_text: warningText };
  });
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

// Runs every extracted/entered marker through the clinical rule engine and
// attaches sourcing-product insight, related tests and safety flags. This
// is the single place OCR and manual entry both funnel through so the two
// paths can never drift into different interpretation logic.
async function enrichMarkers(patientId, rawMarkers, testTypesByKey) {
  const clinicalContext = await getPatientClinicalContext(patientId);
  const testKeys = rawMarkers.map((m) => m.nutrient_key);
  const rulesByKey = await getActiveRules(testKeys);
  const relatedByKey = await getRelatedTests(testKeys);
  const nutrientKeys = [...new Set(rawMarkers.map((m) => testTypesByKey.get(m.nutrient_key)?.nutrient_key).filter(Boolean))];
  const allSafetyFlags = await getSafetyFlags(nutrientKeys, testKeys);
  const allRecommendations = await getRecommendationRules(nutrientKeys);

  const enriched = [];
  for (const marker of rawMarkers) {
    const testType = testTypesByKey.get(marker.nutrient_key);
    const sourcingProducts = await findSourcingProducts(patientId, marker.nutrient_key);

    let interpretation = {
      lab_status: marker.value != null ? flagFor({ ref_low: marker.reference_min ?? testType?.ref_low, ref_high: marker.reference_max ?? testType?.ref_high }, marker.value) : null,
      lab_reference_used: null, nutritional_status: 'UNKNOWN', label: null, message: null,
      recommended_action: null, requires_review: false, related_lab_test_key: null,
      matched_rule_id: null, matched_rule_version: null, evidence_source_id: null,
    };
    if (testType) {
      interpretation = interpretResult({
        testType,
        rules: rulesByKey[marker.nutrient_key] || [],
        value: marker.value,
        labProvidedRange: (marker.reference_min != null || marker.reference_max != null)
          ? { min: marker.reference_min, max: marker.reference_max }
          : null,
        patientContext: clinicalContext,
      });
      // Normalize legacy lab_status vocabulary (LOW/NORMAL/HIGH) to the new one.
      if (interpretation.lab_status === 'NORMAL') interpretation.lab_status = 'NORMAL_BY_LAB';
    }

    const relatedTests = testType ? (relatedByKey[testType.key] || []) : [];
    const safetyFlags = testType ? safetyFlagsForMarker(allSafetyFlags, testType, clinicalContext) : [];
    const recommendations = testType ? recommendationsForMarker(allRecommendations, testType, interpretation.nutritional_status) : [];

    enriched.push({
      ...marker,
      category: testType?.category || null,
      routine_status: testType?.routine_status || null,
      ...interpretation,
      sourcing_products: sourcingProducts,
      insight: buildInsight({ label: marker.label, flag: interpretation.lab_status === 'HIGH' ? 'high' : interpretation.lab_status === 'LOW' ? 'low' : interpretation.lab_status === 'NORMAL_BY_LAB' ? 'normal' : 'unknown' }, sourcingProducts),
      related_tests: relatedTests,
      safety_flags: safetyFlags,
      recommendations,
    });
  }
  return enriched;
}

async function saveMarkers(patientId, scannedByStaffId, rawText, markers, extra = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const labResult = await client.query(
      `INSERT INTO lab_results (patient_id, scanned_by_staff_id, raw_text)
       VALUES ($1, $2, $3) RETURNING id, scanned_at`,
      [patientId, scannedByStaffId, rawText]
    );
    for (const m of markers) {
      const inserted = await client.query(
        `INSERT INTO lab_result_markers
           (lab_result_id, nutrient_key, value, unit, flag, reference_min, reference_max,
            reference_range_text, reference_source, reference_range_type, lab_status,
            nutritional_status, interpretation_message, clinical_review_required,
            fasting_status, lab_name, pharmacist_notes, result_text, test_date,
            interpretation_rule_id, original_value, original_unit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         RETURNING id`,
        [
          labResult.rows[0].id, m.nutrient_key, m.value, m.unit,
          m.lab_status === 'HIGH' ? 'high' : m.lab_status === 'LOW' ? 'low' : m.lab_status === 'NORMAL_BY_LAB' ? 'normal' : 'unknown',
          m.reference_min ?? null, m.reference_max ?? null, m.reference_range_text ?? null,
          m.reference_source ?? null, m.lab_reference_used ?? null, m.lab_status ?? null,
          m.nutritional_status ?? null, m.message ?? null, !!m.requires_review,
          extra.fasting_status ?? null, extra.lab_name ?? null, m.pharmacist_notes ?? null,
          m.result_text ?? null, extra.test_date ?? null, m.matched_rule_id ?? null,
          m.original_value ?? null, m.original_unit ?? null,
        ]
      );
      await writeLabAudit(client, {
        entityType: 'lab_result_marker',
        entityId: inserted.rows[0].id,
        action: 'create',
        staffId: scannedByStaffId,
        newValue: { nutrient_key: m.nutrient_key, value: m.value, nutritional_status: m.nutritional_status, lab_status: m.lab_status },
      });
    }
    await client.query('COMMIT');
    return labResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
  const testTypes = await getTestTypes();
  const testTypesByKey = new Map(testTypes.map((t) => [t.key, t]));
  const parsedMarkers = parseLabText(rawText, testTypes);
  const rawMarkers = parsedMarkers.map((m) => ({ nutrient_key: m.nutrient_key, label: m.label, value: m.value, unit: m.unit }));

  const enrichedMarkers = await enrichMarkers(patientId, rawMarkers, testTypesByKey);
  const labResult = await saveMarkers(patientId, req.user.role === 'patient' ? null : req.user.id, rawText, enrichedMarkers);
  res.status(201).json({
    id: labResult.id,
    scanned_at: labResult.scanned_at,
    raw_text: rawText,
    markers: enrichedMarkers,
    disclaimer: disclaimerFor(req),
  });
}));

// Manually enter lab values -- for when OCR reads a value wrong, the photo
// doesn't come out clearly, or the lab printed its own reference range that
// should take priority over the general catalog range. Body:
// { patient_id, test_date, lab_name, fasting_status,
//   markers: [{ key, value, result_text, unit, reference_min, reference_max,
//               reference_range_text, reference_source }] }.
// Patients can enter their own; staff/admin can enter for any patient.
router.post('/manual', verifyToken, asyncHandler(async (req, res) => {
  const patientId = resolvePatientId(req);
  if (!patientId) {
    return res.status(400).json({ error: 'patient_id is required' });
  }
  if (!canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const entries = (req.body.markers || []).filter((m) => m.key && ((m.value !== '' && m.value != null) || (m.result_text && m.result_text.trim())));
  if (entries.length === 0) {
    return res.status(400).json({ error: 'At least one test value is required' });
  }

  const testTypes = await getTestTypes();
  const testTypesByKey = new Map(testTypes.map((t) => [t.key, t]));

  const rawMarkers = [];
  const skipped = [];
  for (const entry of entries) {
    const testType = testTypesByKey.get(entry.key);
    if (!testType) {
      skipped.push({ key: entry.key, reason: 'Unknown test key' });
      continue;
    }

    if (entry.result_text && (entry.value === '' || entry.value == null)) {
      rawMarkers.push({ nutrient_key: testType.key, label: testType.label, value: null, unit: testType.unit, result_text: entry.result_text });
      continue;
    }

    let value = parseFloat(entry.value);
    let originalValue = null;
    let originalUnit = null;
    if (entry.unit && entry.unit !== testType.unit) {
      const converted = convertUnit(value, entry.unit, testType.unit, testType.unit, testType.alternative_units);
      if (!converted) {
        skipped.push({ key: entry.key, reason: `Cannot safely convert ${entry.unit} to ${testType.unit} -- enter the value in ${testType.unit} or add this conversion to the test's catalog entry.` });
        continue;
      }
      originalValue = converted.original_value;
      originalUnit = converted.original_unit;
      value = converted.value;
    }

    rawMarkers.push({
      nutrient_key: testType.key,
      label: testType.label,
      value,
      unit: testType.unit,
      original_value: originalValue,
      original_unit: originalUnit,
      reference_min: entry.reference_min === '' || entry.reference_min == null ? null : Number(entry.reference_min),
      reference_max: entry.reference_max === '' || entry.reference_max == null ? null : Number(entry.reference_max),
      reference_range_text: entry.reference_range_text || null,
      reference_source: entry.reference_source || null,
    });
  }
  if (rawMarkers.length === 0) {
    return res.status(400).json({ error: 'None of the submitted test keys were recognized or convertible', skipped });
  }

  const enrichedMarkers = await enrichMarkers(patientId, rawMarkers, testTypesByKey);
  const labResult = await saveMarkers(patientId, req.user.role === 'patient' ? null : req.user.id, null, enrichedMarkers, {
    test_date: req.body.test_date || null,
    lab_name: req.body.lab_name || null,
    fasting_status: req.body.fasting_status || null,
  });
  res.status(201).json({
    id: labResult.id,
    scanned_at: labResult.scanned_at,
    raw_text: null,
    markers: enrichedMarkers,
    skipped,
    disclaimer: disclaimerFor(req),
  });
}));

// Lab scan history for a patient (most recent first). Staff/admin can view
// any patient; a patient can only view their own.
router.get('/:patientId', verifyToken, asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  if (!canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const testTypes = await getTestTypes();
  const testTypesByKey = new Map(testTypes.map((t) => [t.key, t]));

  const { rows: results } = await pool.query(
    `SELECT id, scanned_at FROM lab_results WHERE patient_id = $1 ORDER BY scanned_at DESC`,
    [patientId]
  );

  const withMarkers = [];
  for (const result of results) {
    const { rows: markerRows } = await pool.query(
      `SELECT id, nutrient_key, value, unit, flag, reference_min, reference_max, reference_range_text,
              reference_source, reference_range_type AS lab_reference_used, lab_status, nutritional_status,
              interpretation_message AS message, clinical_review_required AS requires_review,
              fasting_status, lab_name, pharmacist_notes, result_text, test_date,
              interpretation_rule_id AS matched_rule_id, original_value, original_unit,
              reviewed_by_staff_id, reviewed_at
       FROM lab_result_markers WHERE lab_result_id = $1`,
      [result.id]
    );
    const clinicalContext = await getPatientClinicalContext(patientId);
    const nutrientKeys = [...new Set(markerRows.map((m) => testTypesByKey.get(m.nutrient_key)?.nutrient_key).filter(Boolean))];
    const testKeys = markerRows.map((m) => m.nutrient_key);
    const allSafetyFlags = await getSafetyFlags(nutrientKeys, testKeys);
    const relatedByKey = await getRelatedTests(testKeys);
    const allRecommendations = await getRecommendationRules(nutrientKeys);

    const markers = [];
    for (const m of markerRows) {
      const testType = testTypesByKey.get(m.nutrient_key);
      const sourcingProducts = await findSourcingProducts(patientId, m.nutrient_key);
      const withLabel = {
        ...m,
        label: testType?.label || m.nutrient_key,
        category: testType?.category || null,
        routine_status: testType?.routine_status || null,
        sourcing_products: sourcingProducts,
        insight: buildInsight({ label: testType?.label || m.nutrient_key, flag: m.flag }, sourcingProducts),
        related_tests: testType ? (relatedByKey[testType.key] || []) : [],
        safety_flags: testType ? safetyFlagsForMarker(allSafetyFlags, testType, clinicalContext) : [],
        recommendations: testType ? recommendationsForMarker(allRecommendations, testType, m.nutritional_status) : [],
      };
      markers.push(withLabel);
    }
    withMarkers.push({ ...result, markers });
  }

  res.json({ results: withMarkers, disclaimer: disclaimerFor(req) });
}));

// Pharmacist review actions on a single result marker: add/update a note,
// and/or mark it reviewed. Never changes the stored interpretation itself
// (that stays tied to the rule version that produced it) -- this only
// records the human review on top of it. Staff/admin only.
router.patch('/marker/:markerId', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { markerId } = req.params;
  if (!/^\d+$/.test(markerId)) {
    return res.status(400).json({ error: 'Invalid marker id' });
  }
  const { pharmacist_notes, mark_reviewed } = req.body;

  const { rows: beforeRows } = await pool.query('SELECT * FROM lab_result_markers WHERE id = $1', [markerId]);
  if (beforeRows.length === 0) {
    return res.status(404).json({ error: 'Lab result marker not found' });
  }

  const { rows } = await pool.query(
    `UPDATE lab_result_markers SET
       pharmacist_notes = COALESCE($1, pharmacist_notes),
       reviewed_by_staff_id = CASE WHEN $2 THEN $3 ELSE reviewed_by_staff_id END,
       reviewed_at = CASE WHEN $2 THEN now() ELSE reviewed_at END
     WHERE id = $4
     RETURNING *`,
    [pharmacist_notes ?? null, !!mark_reviewed, req.user.id, markerId]
  );

  await writeLabAudit(pool, {
    entityType: 'lab_result_marker',
    entityId: Number(markerId),
    action: 'review',
    staffId: req.user.id,
    previousValue: { pharmacist_notes: beforeRows[0].pharmacist_notes, reviewed_at: beforeRows[0].reviewed_at },
    newValue: { pharmacist_notes: rows[0].pharmacist_notes, reviewed_at: rows[0].reviewed_at },
  });

  res.json(rows[0]);
}));

module.exports = router;

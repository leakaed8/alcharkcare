// Pure decision-support rule engine for the Laboratory & Nutritional
// Assessment module: DATABASE -> [this file] -> API -> UI. No DB access
// here -- callers fetch the relevant rows and pass them in, which keeps
// this testable with plain node:test and keeps the layering explicit.
//
// This module NEVER diagnoses disease, NEVER prescribes treatment, and
// NEVER recommends a dose. It only classifies a lab value against
// versioned, source-attributed thresholds and returns structured,
// disclosed decision-support output. Nutritional interpretation
// (nutritional_status) is deliberately kept separate from lab_status
// (the patient's own lab-provided range) -- the two can differ and both
// are returned so the caller can display both.
//
// Operator semantics for lab_interpretation_rules.operator, applied to a
// numeric value v:
//   lt(high):            v <  high
//   lte(high):            v <= high
//   gt(low):             v >  low
//   gte(low):             v >= low
//   between(low, high):  low <= v < high   (low inclusive, high exclusive)

function matchesBand(operator, value, thresholdLow, thresholdHigh) {
  const v = Number(value);
  if (Number.isNaN(v)) return false;
  switch (operator) {
    case 'lt': return v < Number(thresholdHigh);
    case 'lte': return v <= Number(thresholdHigh);
    case 'gt': return v > Number(thresholdLow);
    case 'gte': return v >= Number(thresholdLow);
    case 'between': return v >= Number(thresholdLow) && v < Number(thresholdHigh);
    default: return false;
  }
}

// Does this rule's sex/age/pregnancy constraints match the patient? A rule
// with no constraint on a dimension applies regardless (constraint === null).
function ruleAppliesToPatient(rule, context = {}) {
  if (rule.applies_sex != null) {
    if (!context.sex || String(context.sex).toLowerCase() !== String(rule.applies_sex).toLowerCase()) {
      return false;
    }
  }
  if (rule.applies_min_age != null) {
    if (context.ageYears == null || context.ageYears < Number(rule.applies_min_age)) return false;
  }
  if (rule.applies_max_age != null) {
    if (context.ageYears == null || context.ageYears > Number(rule.applies_max_age)) return false;
  }
  if (rule.applies_pregnancy != null) {
    if (context.pregnant == null || Boolean(context.pregnant) !== Boolean(rule.applies_pregnancy)) return false;
  }
  return true;
}

function hasPatientConstraint(rule) {
  return rule.applies_sex != null || rule.applies_min_age != null || rule.applies_max_age != null || rule.applies_pregnancy != null;
}

// Selects the best-matching active rule for a value + patient context out
// of a pre-filtered (same lab_test_key, active=true) rule list.
// Returns one of:
//   { status: 'MATCHED', rule }
//   { status: 'INSUFFICIENT_CONTEXT' }  -- a constrained rule exists but the
//     patient's sex/age/pregnancy status is missing or didn't match any
//     defined band, so we cannot pick a range confidently.
//   { status: 'NO_BAND_MATCH' }         -- context was fine but the value
//     didn't fall in any defined band (a gap in the rule set).
//   { status: 'NO_RULES' }              -- no rules were supplied at all.
function selectRule(rules, value, context = {}) {
  if (!rules || rules.length === 0) return { status: 'NO_RULES' };

  const anyConstrained = rules.some(hasPatientConstraint);
  const eligible = rules.filter((r) => ruleAppliesToPatient(r, context));
  const matches = eligible.filter((r) => matchesBand(r.operator, value, r.threshold_low, r.threshold_high));

  if (matches.length > 0) {
    matches.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return { status: 'MATCHED', rule: matches[0] };
  }

  // Nothing matched. If constrained rules exist but none were eligible
  // given this patient's context, that's a context problem, not a value
  // problem -- covers e.g. zinc requiring sex when sex is unknown.
  if (anyConstrained && eligible.length === 0) return { status: 'INSUFFICIENT_CONTEXT' };
  return { status: 'NO_BAND_MATCH' };
}

// lab_status: purely mechanical -- where does this value sit relative to
// the reference range actually in force for this result? Priority always
// goes to the patient's own lab-provided range over any catalog fallback;
// callers decide which range to pass in as referenceMin/referenceMax and
// report which one was used via referenceType.
function computeLabStatus(value, referenceMin, referenceMax) {
  if (value == null || Number.isNaN(Number(value))) return null;
  if (referenceMin == null && referenceMax == null) return null;
  const v = Number(value);
  if (referenceMin != null && v < Number(referenceMin)) return 'LOW';
  if (referenceMax != null && v > Number(referenceMax)) return 'HIGH';
  return 'NORMAL_BY_LAB';
}

// Safe, table-driven unit conversion. Only converts when the target unit
// is explicitly listed in the test's alternative_units (or is the
// canonical unit itself) -- never guesses at an ambiguous conversion.
// alternativeUnits: [{ unit, factor }] where canonicalValue * factor =
// value in `unit`.
function convertUnit(value, fromUnit, toUnit, canonicalUnit, alternativeUnits) {
  if (value == null || Number.isNaN(Number(value))) return null;
  if (!fromUnit || !toUnit || fromUnit === toUnit) {
    return { value: Number(value), unit: fromUnit || toUnit, converted: false };
  }
  const alts = alternativeUnits || [];
  const v = Number(value);

  if (fromUnit === canonicalUnit) {
    const alt = alts.find((a) => a.unit === toUnit);
    if (alt) return { value: v * Number(alt.factor), unit: toUnit, converted: true, original_value: v, original_unit: fromUnit };
    return null;
  }
  if (toUnit === canonicalUnit) {
    const alt = alts.find((a) => a.unit === fromUnit);
    if (alt) return { value: v / Number(alt.factor), unit: toUnit, converted: true, original_value: v, original_unit: fromUnit };
    return null;
  }
  // Neither side is the canonical unit -- would require chaining two
  // conversions, which risks compounding error/ambiguity. Refuse.
  return null;
}

// Transparent iron-panel calculation: transferrin saturation = serum iron
// / TIBC x 100. Both inputs must be in the same unit (µg/dL) already.
function calculateTransferrinSaturation(serumIron, tibc) {
  if (serumIron == null || tibc == null) return null;
  const iron = Number(serumIron);
  const cap = Number(tibc);
  if (Number.isNaN(iron) || Number.isNaN(cap) || cap === 0) return null;
  return {
    value: Math.round((iron / cap) * 100 * 10) / 10,
    unit: '%',
    formula: 'Serum Iron / TIBC x 100',
  };
}

const INSUFFICIENT_CONTEXT_MESSAGE = 'Reference range depends on patient characteristics and/or laboratory method.';
const NOT_ESTABLISHED_MESSAGE = "No standardized nutritional interpretation is established for this test here. Refer to the reporting laboratory's own reference range.";

// Orchestrator. testType: the lab_test_types row (unit, ref_low, ref_high,
// reference_range_type, nutrient_key, ...). rules: active
// lab_interpretation_rules rows for this test's key, already loaded by the
// caller. labProvidedRange: { min, max } captured for this specific
// result, if the lab printed one on the report. patientContext: { sex,
// ageYears, pregnant }.
function interpretResult({ testType, rules = [], value, labProvidedRange, patientContext = {} }) {
  let labStatus = null;
  let labReferenceUsed = null;

  if (labProvidedRange && (labProvidedRange.min != null || labProvidedRange.max != null)) {
    labStatus = computeLabStatus(value, labProvidedRange.min, labProvidedRange.max);
    labReferenceUsed = 'LAB_PROVIDED';
  } else if (testType.reference_range_type === 'STANDARD_REFERENCE' && (testType.ref_low != null || testType.ref_high != null)) {
    labStatus = computeLabStatus(value, testType.ref_low, testType.ref_high);
    labReferenceUsed = 'STANDARD_REFERENCE';
  }

  if (value == null || Number.isNaN(Number(value))) {
    return {
      lab_status: labStatus,
      lab_reference_used: labReferenceUsed,
      nutritional_status: 'UNKNOWN',
      label: 'Not evaluable',
      message: 'No numeric result was available to interpret.',
      recommended_action: null,
      requires_review: false,
      related_lab_test_key: null,
      matched_rule_id: null,
      matched_rule_version: null,
      evidence_source_id: null,
    };
  }

  const selection = selectRule(rules, value, patientContext);

  if (selection.status === 'NO_RULES') {
    return {
      lab_status: labStatus,
      lab_reference_used: labReferenceUsed,
      nutritional_status: 'UNKNOWN',
      label: 'Not established',
      message: NOT_ESTABLISHED_MESSAGE,
      recommended_action: null,
      requires_review: false,
      related_lab_test_key: null,
      matched_rule_id: null,
      matched_rule_version: null,
      evidence_source_id: null,
    };
  }

  if (selection.status === 'INSUFFICIENT_CONTEXT') {
    return {
      lab_status: labStatus,
      lab_reference_used: labReferenceUsed,
      nutritional_status: 'REVIEW',
      label: 'Review',
      message: INSUFFICIENT_CONTEXT_MESSAGE,
      recommended_action: 'Record patient sex/age/pregnancy status if available, or have the pharmacist review manually.',
      requires_review: true,
      related_lab_test_key: null,
      matched_rule_id: null,
      matched_rule_version: null,
      evidence_source_id: null,
    };
  }

  if (selection.status === 'NO_BAND_MATCH') {
    return {
      lab_status: labStatus,
      lab_reference_used: labReferenceUsed,
      nutritional_status: 'REVIEW',
      label: 'Review',
      message: 'This value did not fall within any defined interpretation band for this test -- pharmacist review recommended.',
      recommended_action: null,
      requires_review: true,
      related_lab_test_key: null,
      matched_rule_id: null,
      matched_rule_version: null,
      evidence_source_id: null,
    };
  }

  const rule = selection.rule;
  let relatedKey = null;
  if (rule.notes && /Related test:\s*(\S+)/.test(rule.notes)) {
    relatedKey = rule.notes.match(/Related test:\s*(\S+)/)[1];
  }

  return {
    lab_status: labStatus,
    lab_reference_used: labReferenceUsed,
    nutritional_status: rule.severity,
    label: rule.label,
    message: rule.message,
    recommended_action: rule.recommended_action,
    requires_review: !!rule.requires_review,
    related_lab_test_key: relatedKey,
    matched_rule_id: rule.id,
    matched_rule_version: rule.version,
    evidence_source_id: rule.evidence_source_id,
  };
}

module.exports = {
  matchesBand,
  ruleAppliesToPatient,
  selectRule,
  computeLabStatus,
  convertUnit,
  calculateTransferrinSaturation,
  interpretResult,
  INSUFFICIENT_CONTEXT_MESSAGE,
  NOT_ESTABLISHED_MESSAGE,
};

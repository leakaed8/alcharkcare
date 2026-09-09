const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  matchesBand,
  selectRule,
  computeLabStatus,
  convertUnit,
  calculateTransferrinSaturation,
  interpretResult,
  INSUFFICIENT_CONTEXT_MESSAGE,
  NOT_ESTABLISHED_MESSAGE,
} = require('../lib/labRuleEngine');

// Fixture rules mirror exactly what db/seedLabClinical.js inserts for these
// tests, so these tests exercise the same numeric bands as production data.

const vitaminDRules = [
  { id: 1, version: 1, operator: 'lt', threshold_high: 12, severity: 'DEFICIENT', label: 'Deficient', message: 'x', requires_review: true, priority: 10 },
  { id: 2, version: 1, operator: 'between', threshold_low: 12, threshold_high: 20, severity: 'LOW', label: 'Potentially inadequate', message: 'x', requires_review: false, priority: 9 },
  { id: 3, version: 1, operator: 'between', threshold_low: 20, threshold_high: 50, severity: 'ADEQUATE', label: 'Generally adequate', message: 'x', requires_review: false, priority: 8 },
  { id: 4, version: 1, operator: 'gte', threshold_low: 50, severity: 'REVIEW', label: 'Above typical range', message: 'x', requires_review: true, priority: 7 },
];

const b12Rules = [
  { id: 10, version: 1, operator: 'lt', threshold_high: 150, severity: 'LOW', label: 'Low', message: 'x', requires_review: true, priority: 10, notes: 'Related test: mma' },
  { id: 11, version: 1, operator: 'between', threshold_low: 150, threshold_high: 400, severity: 'BORDERLINE', label: 'Borderline', message: 'x', requires_review: true, priority: 9, notes: 'Related test: mma' },
  { id: 12, version: 1, operator: 'gte', threshold_low: 400, severity: 'ADEQUATE', label: 'Adequate', message: 'x', requires_review: false, priority: 8 },
];

const mmaRules = [
  { id: 20, version: 1, operator: 'lte', threshold_high: 0.271, severity: 'NORMAL', label: 'Not elevated', message: 'x', requires_review: false, priority: 9 },
  { id: 21, version: 1, operator: 'gt', threshold_low: 0.271, severity: 'HIGH', label: 'Elevated', message: 'x', requires_review: true, priority: 10 },
];

const ferritinRules = [
  { id: 30, version: 1, operator: 'lt', threshold_high: 10, severity: 'DEFICIENT', label: 'Strongly suggestive of deficiency', message: 'x', requires_review: true, priority: 10 },
  { id: 31, version: 1, operator: 'between', threshold_low: 10, threshold_high: 30, severity: 'LOW', label: 'Possible deficiency', message: 'x', requires_review: true, priority: 9 },
  { id: 32, version: 1, operator: 'gte', threshold_low: 30, severity: 'ADEQUATE', label: 'No evidence of deficiency by ferritin alone', message: 'x', requires_review: false, priority: 8 },
];

const zincRules = [
  { id: 40, version: 1, operator: 'lt', threshold_high: 70, applies_sex: 'female', severity: 'LOW', label: 'Low', message: 'x', requires_review: false, priority: 10 },
  { id: 41, version: 1, operator: 'gte', threshold_low: 70, applies_sex: 'female', severity: 'ADEQUATE', label: 'Adequate', message: 'x', requires_review: false, priority: 9 },
  { id: 42, version: 1, operator: 'lt', threshold_high: 74, applies_sex: 'male', severity: 'LOW', label: 'Low', message: 'x', requires_review: false, priority: 10 },
  { id: 43, version: 1, operator: 'gte', threshold_low: 74, applies_sex: 'male', severity: 'ADEQUATE', label: 'Adequate', message: 'x', requires_review: false, priority: 9 },
];

const folateRules = [
  { id: 50, version: 1, operator: 'lte', threshold_high: 3, severity: 'LOW', label: 'Low', message: 'x', requires_review: false, priority: 10 },
  { id: 51, version: 1, operator: 'gt', threshold_low: 3, severity: 'ADEQUATE', label: 'Adequate', message: 'x', requires_review: false, priority: 9 },
];

describe('matchesBand operator semantics', () => {
  test('lt is strictly less than', () => {
    assert.equal(matchesBand('lt', 11.9, null, 12), true);
    assert.equal(matchesBand('lt', 12, null, 12), false);
  });
  test('between is low-inclusive, high-exclusive', () => {
    assert.equal(matchesBand('between', 12, 12, 20), true);
    assert.equal(matchesBand('between', 19.99, 12, 20), true);
    assert.equal(matchesBand('between', 20, 12, 20), false);
  });
  test('gte is inclusive', () => {
    assert.equal(matchesBand('gte', 50, 50, null), true);
    assert.equal(matchesBand('gte', 49.99, 50, null), false);
  });
});

describe('Vitamin D interpretation (ng/mL)', () => {
  const cases = [
    [8, 'DEFICIENT'],
    [11.9, 'DEFICIENT'],
    [12, 'LOW'],
    [15, 'LOW'],
    [19.9, 'LOW'],
    [20, 'ADEQUATE'],
    [30, 'ADEQUATE'],
    [49.9, 'ADEQUATE'],
    [50, 'REVIEW'],
    [60, 'REVIEW'],
  ];
  for (const [value, expected] of cases) {
    test(`${value} ng/mL -> ${expected}`, () => {
      const result = selectRule(vitaminDRules, value, {});
      assert.equal(result.status, 'MATCHED');
      assert.equal(result.rule.severity, expected);
    });
  }
});

describe('Vitamin B12 interpretation (pg/mL) - user-specified example rule', () => {
  const cases = [
    [149, 'LOW'],
    [150, 'BORDERLINE'],
    [199, 'BORDERLINE'],
    [220, 'BORDERLINE'],
    [300, 'BORDERLINE'],
    [399, 'BORDERLINE'],
    [400, 'ADEQUATE'],
    [500, 'ADEQUATE'],
  ];
  for (const [value, expected] of cases) {
    test(`${value} pg/mL -> ${expected}`, () => {
      const result = selectRule(b12Rules, value, {});
      assert.equal(result.rule.severity, expected);
      if (expected === 'BORDERLINE') {
        assert.equal(result.rule.requires_review, true);
      }
    });
  }
});

describe('MMA interpretation (µmol/L)', () => {
  test('0.20 -> not elevated', () => {
    assert.equal(selectRule(mmaRules, 0.20, {}).rule.severity, 'NORMAL');
  });
  test('0.271 -> boundary, not elevated (lte)', () => {
    assert.equal(selectRule(mmaRules, 0.271, {}).rule.severity, 'NORMAL');
  });
  test('0.35 -> elevated', () => {
    const result = selectRule(mmaRules, 0.35, {});
    assert.equal(result.rule.severity, 'HIGH');
    assert.equal(result.rule.requires_review, true);
  });
});

describe('Ferritin interpretation (ng/mL)', () => {
  const cases = [
    [8, 'DEFICIENT'],
    [20, 'LOW'],
    [29, 'LOW'],
    [30, 'ADEQUATE'],
    [50, 'ADEQUATE'],
    [200, 'ADEQUATE'],
  ];
  for (const [value, expected] of cases) {
    test(`${value} ng/mL -> ${expected}`, () => {
      assert.equal(selectRule(ferritinRules, value, {}).rule.severity, expected);
    });
  }
});

describe('Zinc interpretation is sex-conditional', () => {
  const cases = [
    [65, 'female', 'LOW'],
    [70, 'female', 'ADEQUATE'],
    [80, 'female', 'ADEQUATE'],
    [65, 'male', 'LOW'],
    [70, 'male', 'LOW'],
    [74, 'male', 'ADEQUATE'],
    [120, 'male', 'ADEQUATE'],
  ];
  for (const [value, sex, expected] of cases) {
    test(`${value} mcg/dL, sex=${sex} -> ${expected}`, () => {
      const result = selectRule(zincRules, value, { sex });
      assert.equal(result.rule.severity, expected);
    });
  }

  test('unknown sex falls back to REVIEW (insufficient context)', () => {
    const result = selectRule(zincRules, 80, {});
    assert.equal(result.status, 'INSUFFICIENT_CONTEXT');
  });

  test('interpretResult surfaces the insufficient-context message for unknown sex', () => {
    const testType = { unit: 'mcg/dL', ref_low: 60, ref_high: 120, reference_range_type: 'CLINICAL_INTERPRETATION' };
    const result = interpretResult({ testType, rules: zincRules, value: 80, patientContext: {} });
    assert.equal(result.nutritional_status, 'REVIEW');
    assert.equal(result.message, INSUFFICIENT_CONTEXT_MESSAGE);
    assert.equal(result.requires_review, true);
  });
});

describe('Folate interpretation (ng/mL)', () => {
  const cases = [[2, 'LOW'], [3, 'LOW'], [5, 'ADEQUATE']];
  for (const [value, expected] of cases) {
    test(`${value} ng/mL -> ${expected}`, () => {
      assert.equal(selectRule(folateRules, value, {}).rule.severity, expected);
    });
  }
});

describe('Magnesium relies on the lab-provided range (no universal nutritional band seeded)', () => {
  test('low value flagged against lab-provided range', () => {
    assert.equal(computeLabStatus(1.5, 1.7, 2.2), 'LOW');
  });
  test('normal value against lab-provided range', () => {
    assert.equal(computeLabStatus(1.9, 1.7, 2.2), 'NORMAL_BY_LAB');
  });
  test('high value against lab-provided range', () => {
    assert.equal(computeLabStatus(2.5, 1.7, 2.2), 'HIGH');
  });
  test('no rules -> nutritional_status UNKNOWN, not a fabricated normal', () => {
    const testType = { unit: 'mg/dL', ref_low: null, ref_high: null, reference_range_type: 'STANDARD_REFERENCE' };
    const result = interpretResult({ testType, rules: [], value: 1.9, labProvidedRange: { min: 1.7, max: 2.2 } });
    assert.equal(result.lab_status, 'NORMAL_BY_LAB');
    assert.equal(result.lab_reference_used, 'LAB_PROVIDED');
    assert.equal(result.nutritional_status, 'UNKNOWN');
    assert.equal(result.message, NOT_ESTABLISHED_MESSAGE);
  });
});

describe('Unit conversion is safe and table-driven', () => {
  const vitaminDAltUnits = [{ unit: 'nmol/L', factor: 2.5 }];
  test('ng/mL -> nmol/L multiplies by 2.5', () => {
    const result = convertUnit(20, 'ng/mL', 'nmol/L', 'ng/mL', vitaminDAltUnits);
    assert.equal(result.value, 50);
    assert.equal(result.converted, true);
    assert.equal(result.original_value, 20);
    assert.equal(result.original_unit, 'ng/mL');
  });
  test('nmol/L -> ng/mL divides by 2.5', () => {
    const result = convertUnit(50, 'nmol/L', 'ng/mL', 'ng/mL', vitaminDAltUnits);
    assert.equal(result.value, 20);
  });
  test('same unit is a no-op, not "converted"', () => {
    const result = convertUnit(20, 'ng/mL', 'ng/mL', 'ng/mL', vitaminDAltUnits);
    assert.equal(result.converted, false);
  });
  test('unlisted/ambiguous unit conversion refuses rather than guessing', () => {
    assert.equal(convertUnit(20, 'ng/mL', 'mg/L', 'ng/mL', vitaminDAltUnits), null);
  });
  test('ferritin ng/mL <-> µg/L is 1:1', () => {
    const ferritinAltUnits = [{ unit: 'µg/L', factor: 1 }];
    const result = convertUnit(30, 'ng/mL', 'µg/L', 'ng/mL', ferritinAltUnits);
    assert.equal(result.value, 30);
  });
});

describe('Missing reference range', () => {
  test('computeLabStatus returns null when no range is available at all', () => {
    assert.equal(computeLabStatus(20, null, null), null);
  });
  test('interpretResult returns lab_status null and lab_reference_used null when nothing is available', () => {
    const testType = { unit: 'µg/dL', ref_low: null, ref_high: null, reference_range_type: 'NOT_ESTABLISHED' };
    const result = interpretResult({ testType, rules: [], value: 50 });
    assert.equal(result.lab_status, null);
    assert.equal(result.lab_reference_used, null);
    assert.equal(result.nutritional_status, 'UNKNOWN');
  });
});

describe("Patient's own lab-provided range takes priority over the catalog fallback", () => {
  test('lab-provided range is used even when a STANDARD_REFERENCE catalog range exists', () => {
    // Catalog says 30-100, but this specific lab report printed 25-90.
    const testType = { unit: 'ng/mL', ref_low: 30, ref_high: 100, reference_range_type: 'STANDARD_REFERENCE' };
    const result = interpretResult({ testType, rules: [], value: 27, labProvidedRange: { min: 25, max: 90 } });
    assert.equal(result.lab_reference_used, 'LAB_PROVIDED');
    assert.equal(result.lab_status, 'NORMAL_BY_LAB'); // 27 is within the lab's own 25-90 range
  });
});

describe('Child / pregnancy context', () => {
  const ageRules = [
    { id: 60, operator: 'lt', threshold_high: 10, applies_min_age: 0, applies_max_age: 17, severity: 'LOW', label: 'Low (pediatric)', message: 'x', priority: 10 },
    { id: 61, operator: 'gte', threshold_low: 10, applies_min_age: 0, applies_max_age: 17, severity: 'ADEQUATE', label: 'Adequate (pediatric)', message: 'x', priority: 9 },
    { id: 62, operator: 'lt', threshold_high: 12, applies_min_age: 18, severity: 'LOW', label: 'Low (adult)', message: 'x', priority: 10 },
    { id: 63, operator: 'gte', threshold_low: 12, applies_min_age: 18, severity: 'ADEQUATE', label: 'Adequate (adult)', message: 'x', priority: 9 },
  ];
  test('a child gets the pediatric band', () => {
    const result = selectRule(ageRules, 11, { ageYears: 8 });
    assert.equal(result.rule.severity, 'ADEQUATE');
    assert.equal(result.rule.label, 'Adequate (pediatric)');
  });
  test('an adult gets the adult band', () => {
    const result = selectRule(ageRules, 11, { ageYears: 30 });
    assert.equal(result.rule.severity, 'LOW');
    assert.equal(result.rule.label, 'Low (adult)');
  });
  test('missing age with only age-constrained rules falls back to insufficient context', () => {
    const result = selectRule(ageRules, 11, {});
    assert.equal(result.status, 'INSUFFICIENT_CONTEXT');
  });

  const pregnancyRules = [
    { id: 70, operator: 'lt', threshold_high: 30, applies_pregnancy: true, severity: 'LOW', label: 'Low (pregnant)', message: 'x', priority: 10 },
    { id: 71, operator: 'gte', threshold_low: 30, applies_pregnancy: true, severity: 'ADEQUATE', label: 'Adequate (pregnant)', message: 'x', priority: 9 },
    { id: 72, operator: 'lt', threshold_high: 20, applies_pregnancy: false, severity: 'LOW', label: 'Low (not pregnant)', message: 'x', priority: 10 },
    { id: 73, operator: 'gte', threshold_low: 20, applies_pregnancy: false, severity: 'ADEQUATE', label: 'Adequate (not pregnant)', message: 'x', priority: 9 },
  ];
  test('pregnant patient gets the pregnancy-specific band', () => {
    const result = selectRule(pregnancyRules, 25, { pregnant: true });
    assert.equal(result.rule.label, 'Low (pregnant)');
  });
  test('non-pregnant patient gets the non-pregnancy band', () => {
    const result = selectRule(pregnancyRules, 25, { pregnant: false });
    assert.equal(result.rule.label, 'Adequate (not pregnant)');
  });
});

describe('Renal impairment / inflammation context is informational, not auto-diagnostic', () => {
  test('MMA elevated result still carries its own message regardless of renal context (renal caveat is a separate safety flag, not a different threshold)', () => {
    const result = selectRule(mmaRules, 0.4, { renalImpairment: true });
    assert.equal(result.rule.severity, 'HIGH');
  });
});

describe('Duplicate / historical results keep independent interpretations', () => {
  test('two results for the same test at different values each get their own correct band', () => {
    const first = selectRule(vitaminDRules, 10, {});
    const second = selectRule(vitaminDRules, 40, {});
    assert.equal(first.rule.severity, 'DEFICIENT');
    assert.equal(second.rule.severity, 'ADEQUATE');
  });

  test('a historical result keeps referring to the rule version that was active when it was matched', () => {
    const oldRuleSet = [{ id: 1, version: 1, operator: 'lt', threshold_high: 12, severity: 'DEFICIENT', label: 'Deficient', message: 'x', priority: 10 }];
    const newRuleSet = [{ id: 2, version: 2, operator: 'lt', threshold_high: 15, severity: 'DEFICIENT', label: 'Deficient (revised)', message: 'x', priority: 10 }];
    const historicalResult = selectRule(oldRuleSet, 13, {});
    const currentResult = selectRule(newRuleSet, 13, {});
    assert.equal(historicalResult.status, 'NO_BAND_MATCH'); // 13 wasn't deficient under the old v1 threshold
    assert.equal(currentResult.rule.version, 2); // but is under the new v2 threshold -- the two must not be conflated
  });
});

describe('Transferrin saturation calculation is transparent', () => {
  test('serum iron / TIBC x 100', () => {
    const result = calculateTransferrinSaturation(80, 300);
    assert.equal(result.value, 26.7);
    assert.equal(result.formula, 'Serum Iron / TIBC x 100');
  });
  test('missing inputs return null rather than a fabricated number', () => {
    assert.equal(calculateTransferrinSaturation(80, null), null);
  });
});

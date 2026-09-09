// Phase 1 seed data for the Laboratory & Nutritional Assessment module.
// Safe to re-run: every insert uses ON CONFLICT. For lab_test_types rows
// that already exist (seeded earlier by db/seed.js or added via the UI),
// this only backfills the new metadata columns (category, specimen,
// routine_status, ...) and never touches label/unit/ref_low/ref_high/
// aliases, so a staff edit made through the app is never clobbered by
// re-running this script.
//
// Numeric interpretation thresholds are seeded ONLY for the tests where an
// explicit clinical number was specified for this feature. Every other
// test in the catalog is seeded as metadata only (category/specimen/
// routine status/description) with reference_range_type = NOT_ESTABLISHED,
// so the app never presents a fabricated "normal range" as universal --
// the patient's own lab-provided range is the only range shown for those.
require('dotenv').config();
const pool = require('./pool');

// ---------------------------------------------------------------------------
// Evidence sources -- NIH Office of Dietary Supplements Health Professional
// Fact Sheets, the explicitly required primary source (never a supplement
// company site, blog, or unverified health site).
// ---------------------------------------------------------------------------
const NIH_ODS = (slug, title) => ({
  organization: 'NIH Office of Dietary Supplements',
  title,
  url: `https://ods.od.nih.gov/factsheets/${slug}-HealthProfessional/`,
  evidence_level: 'Authoritative government health agency fact sheet',
});

const evidenceSources = [
  ['vitamin_d', NIH_ODS('VitaminD', 'Vitamin D - Health Professional Fact Sheet')],
  ['vitamin_b12', NIH_ODS('VitaminB12', 'Vitamin B12 - Health Professional Fact Sheet')],
  ['folate', NIH_ODS('Folate', 'Folate - Health Professional Fact Sheet')],
  ['vitamin_b6', NIH_ODS('VitaminB6', 'Vitamin B6 - Health Professional Fact Sheet')],
  ['vitamin_a', NIH_ODS('VitaminA', 'Vitamin A - Health Professional Fact Sheet')],
  ['vitamin_c', NIH_ODS('VitaminC', 'Vitamin C - Health Professional Fact Sheet')],
  ['vitamin_e', NIH_ODS('VitaminE', 'Vitamin E - Health Professional Fact Sheet')],
  ['vitamin_b1', NIH_ODS('Thiamin', 'Thiamin - Health Professional Fact Sheet')],
  ['vitamin_k', NIH_ODS('VitaminK', 'Vitamin K - Health Professional Fact Sheet')],
  ['calcium', NIH_ODS('Calcium', 'Calcium - Health Professional Fact Sheet')],
  ['magnesium', NIH_ODS('Magnesium', 'Magnesium - Health Professional Fact Sheet')],
  ['zinc', NIH_ODS('Zinc', 'Zinc - Health Professional Fact Sheet')],
  ['copper', NIH_ODS('Copper', 'Copper - Health Professional Fact Sheet')],
  ['selenium', NIH_ODS('Selenium', 'Selenium - Health Professional Fact Sheet')],
  ['iron', NIH_ODS('Iron', 'Iron - Health Professional Fact Sheet')],
  ['phosphorus', NIH_ODS('Phosphorus', 'Phosphorus - Health Professional Fact Sheet')],
  ['potassium', NIH_ODS('Potassium', 'Potassium - Health Professional Fact Sheet')],
  ['biotin', NIH_ODS('Biotin', 'Biotin - Health Professional Fact Sheet')],
  ['omega_3', NIH_ODS('Omega3FattyAcids', 'Omega-3 Fatty Acids - Health Professional Fact Sheet')],
  ['iodine', NIH_ODS('Iodine', 'Iodine - Health Professional Fact Sheet')],
];

// ---------------------------------------------------------------------------
// Nutrients
// ---------------------------------------------------------------------------
const nutrients = [
  ['vitamin_d', 'Vitamin D', 'VITAMIN', null],
  ['vitamin_b12', 'Vitamin B12', 'VITAMIN', null],
  ['folate', 'Folate (Vitamin B9)', 'VITAMIN', null],
  ['vitamin_b6', 'Vitamin B6', 'VITAMIN', 'Avoid high-dose supplementation -- associated with peripheral neuropathy.'],
  ['vitamin_a', 'Vitamin A', 'VITAMIN', 'Never auto-recommend high-dose vitamin A; teratogenic risk in pregnancy requires clinician review.'],
  ['vitamin_c', 'Vitamin C', 'VITAMIN', null],
  ['vitamin_e', 'Vitamin E', 'VITAMIN', null],
  ['vitamin_b1', 'Vitamin B1 (Thiamine)', 'VITAMIN', null],
  ['vitamin_k', 'Vitamin K', 'VITAMIN', 'Interacts with warfarin/anticoagulants -- flag before any recommendation.'],
  ['calcium', 'Calcium', 'MINERAL', 'High-dose calcium supplementation requires clinical review.'],
  ['magnesium', 'Magnesium', 'MINERAL', 'Use caution in renal impairment.'],
  ['zinc', 'Zinc', 'MINERAL', 'Prolonged high-dose zinc use is associated with copper-deficiency risk.'],
  ['copper', 'Copper', 'MINERAL', 'Never auto-recommend copper supplementation without review.'],
  ['selenium', 'Selenium', 'MINERAL', 'Narrow margin between adequate and excessive intake -- never auto-recommend high-dose selenium.'],
  ['phosphorus', 'Phosphorus (Phosphate)', 'MINERAL', null],
  ['potassium', 'Potassium', 'MINERAL', 'Never auto-recommend potassium supplementation.'],
  ['iron', 'Iron', 'MINERAL', 'Never auto-recommend iron supplementation without clinical review -- overdose risk.'],
  ['biotin', 'Biotin', 'OTHER_NUTRIENT', 'High-dose biotin can interfere with certain lab immunoassays (e.g. thyroid tests). No lab-deficiency rule is derived from routine serum biotin.'],
  ['omega_3', 'Omega-3 Fatty Acids', 'OTHER_NUTRIENT', 'Never inferred from a lipid panel -- elevated triglycerides is NOT evidence of omega-3 deficiency.'],
  ['iodine', 'Iodine', 'MINERAL', 'Pregnancy requires clinician review before any recommendation.'],
];

// ---------------------------------------------------------------------------
// Lab test catalog. Existing keys (first 9) get their metadata backfilled
// only; new keys get a full row. ref_low/ref_high stay null wherever no
// explicit number was specified for this feature (reference_range_type
// NOT_ESTABLISHED) so nothing universal is asserted.
// ---------------------------------------------------------------------------
const testTypes = [
  // key, label, unit, ref_low, ref_high, aliases, category, specimen, routine_status, requires_clinical_context, description, alt_units, nutrient_key, ref_range_type
  ['vitamin_d', 'Vitamin D (25-OH)', 'ng/mL', 30, 100, ['vitamin d', '25-oh vitamin d', '25(oh)d', 'vit d', 'vitamin d3'], 'VITAMINS', 'serum', 'SELECTIVE', false, 'Storage form of vitamin D; the standard marker of vitamin D status.', [{ unit: 'nmol/L', factor: 2.5 }], 'vitamin_d', 'CLINICAL_INTERPRETATION'],
  ['vitamin_b12', 'Vitamin B12', 'pg/mL', 200, 900, ['vitamin b12', 'vit b12', 'b12', 'cobalamin'], 'VITAMINS', 'serum', 'SELECTIVE', true, 'Borderline results should prompt consideration of MMA testing.', null, 'vitamin_b12', 'CLINICAL_INTERPRETATION'],
  ['ferritin', 'Ferritin (iron stores)', 'ng/mL', 20, 250, ['ferritin'], 'IRON_STATUS', 'serum', 'SELECTIVE', true, 'Reflects iron stores; can be falsely elevated by inflammation.', [{ unit: 'µg/L', factor: 1 }], 'iron', 'CLINICAL_INTERPRETATION'],
  ['calcium', 'Calcium', 'mg/dL', 8.5, 10.5, ['calcium'], 'MINERALS', 'serum', 'SELECTIVE', true, 'Total serum calcium; interpret alongside albumin, PTH and vitamin D.', null, 'calcium', 'STANDARD_REFERENCE'],
  ['magnesium', 'Magnesium', 'mg/dL', 1.7, 2.2, ['magnesium'], 'MINERALS', 'serum', 'SELECTIVE', true, 'Serum magnesium; interpret with renal function and potassium.', null, 'magnesium', 'STANDARD_REFERENCE'],
  ['folate', 'Folate (serum)', 'ng/mL', 3, 20, ['folate', 'folic acid'], 'VITAMINS', 'serum', 'SELECTIVE', false, 'Reflects recent folate intake; RBC folate reflects longer-term status.', null, 'folate', 'CLINICAL_INTERPRETATION'],
  ['zinc', 'Zinc', 'mcg/dL', 60, 120, ['zinc'], 'MINERALS', 'serum', 'SELECTIVE', true, 'Interpretation threshold differs by sex.', null, 'zinc', 'CLINICAL_INTERPRETATION'],
  ['vitamin_c', 'Vitamin C', 'mg/L', null, null, ['vitamin c', 'ascorbic acid'], 'VITAMINS', 'serum', 'NOT_ROUTINE_SCREENING', false, 'No universal nutritional-interpretation threshold is asserted here -- use the reporting lab\'s own reference range.', null, 'vitamin_c', 'NOT_ESTABLISHED'],
  ['cholesterol', 'Total Cholesterol', 'mg/dL', 125, 200, ['cholesterol', 'total cholesterol'], 'METABOLIC', 'serum', 'ROUTINE', false, 'Cardiometabolic marker -- NOT a vitamin/nutrient deficiency test.', null, null, 'STANDARD_REFERENCE'],

  ['folate_rbc', 'Folate (RBC)', 'ng/mL', null, null, ['rbc folate', 'red cell folate', 'erythrocyte folate'], 'VITAMINS', 'whole_blood', 'SPECIALIZED', false, 'Reflects longer-term folate status than serum folate.', null, 'folate', 'CLINICAL_INTERPRETATION'],
  ['vitamin_b6_plp', 'Vitamin B6 (PLP)', 'nmol/L', null, null, ['vitamin b6', 'pyridoxal phosphate', 'plp', 'b6'], 'VITAMINS', 'plasma', 'SPECIALIZED', false, 'Pyridoxal-5\'-phosphate, the main circulating form of vitamin B6.', null, 'vitamin_b6', 'CLINICAL_INTERPRETATION'],
  ['vitamin_a_retinol', 'Vitamin A (Retinol)', 'µg/dL', null, null, ['vitamin a', 'retinol'], 'VITAMINS', 'serum', 'SPECIALIZED', true, 'Not a routine screening test. Pregnancy and high-dose supplementation require clinician review before any recommendation.', null, 'vitamin_a', 'NOT_ESTABLISHED'],
  ['vitamin_e', 'Vitamin E', 'mg/L', null, null, ['vitamin e', 'alpha-tocopherol', 'tocopherol'], 'VITAMINS', 'serum', 'SPECIALIZED', false, 'No universal nutritional-interpretation threshold is asserted here -- use the reporting lab\'s own reference range.', null, 'vitamin_e', 'NOT_ESTABLISHED'],
  ['vitamin_b1_thiamine', 'Vitamin B1 (Thiamine)', 'nmol/L', null, null, ['vitamin b1', 'thiamine', 'thiamin'], 'VITAMINS', 'whole_blood', 'SPECIALIZED', false, 'No universal nutritional-interpretation threshold is asserted here -- use the reporting lab\'s own reference range.', null, 'vitamin_b1', 'NOT_ESTABLISHED'],
  ['pt_inr', 'Prothrombin Time / INR', 'INR', null, null, ['pt/inr', 'inr', 'prothrombin time'], 'VITAMINS', 'plasma', 'NOT_ROUTINE_SCREENING', true, 'Functional marker used in place of routine serum vitamin K screening (vitamin K is not a routine screening test). Interacts with anticoagulant therapy.', null, 'vitamin_k', 'NOT_ESTABLISHED'],
  ['calcium_ionized', 'Ionized Calcium', 'mmol/L', null, null, ['ionized calcium', 'free calcium'], 'MINERALS', 'serum', 'SPECIALIZED', true, 'The physiologically active fraction of calcium; useful when albumin is abnormal.', null, 'calcium', 'NOT_ESTABLISHED'],
  ['copper', 'Copper', 'µg/dL', null, null, ['copper'], 'MINERALS', 'serum', 'SPECIALIZED', false, 'Interpret alongside ceruloplasmin and zinc intake history.', null, 'copper', 'NOT_ESTABLISHED'],
  ['ceruloplasmin', 'Ceruloplasmin', 'mg/dL', null, null, ['ceruloplasmin'], 'MINERALS', 'serum', 'SPECIALIZED', false, 'Copper-carrying protein; acute-phase reactant, interpret with inflammation in mind.', null, 'copper', 'NOT_ESTABLISHED'],
  ['selenium', 'Selenium', 'µg/dL', 8, null, ['selenium'], 'MINERALS', 'serum', 'SPECIALIZED', false, 'Only a lower-bound interpretation is encoded; no upper-bound nutritional interpretation is asserted.', null, 'selenium', 'CLINICAL_INTERPRETATION'],
  ['phosphate', 'Phosphate', 'mg/dL', null, null, ['phosphate', 'phosphorus'], 'MINERALS', 'serum', 'NOT_ROUTINE_SCREENING', false, 'No universal nutritional-interpretation threshold is asserted here -- use the reporting lab\'s own reference range.', null, 'phosphorus', 'NOT_ESTABLISHED'],
  ['potassium', 'Potassium', 'mmol/L', null, null, ['potassium', 'k+'], 'MINERALS', 'serum', 'SELECTIVE', true, 'Electrolyte, not a nutrient-deficiency screening test. Never auto-recommend potassium supplementation.', null, 'potassium', 'NOT_ESTABLISHED'],

  ['serum_iron', 'Serum Iron', 'µg/dL', null, null, ['serum iron', 'iron'], 'IRON_STATUS', 'serum', 'SPECIALIZED', false, 'Used with TIBC to calculate transferrin saturation.', null, 'iron', 'NOT_ESTABLISHED'],
  ['tibc', 'Total Iron-Binding Capacity (TIBC)', 'µg/dL', null, null, ['tibc', 'total iron binding capacity'], 'IRON_STATUS', 'serum', 'SPECIALIZED', false, 'Used with serum iron to calculate transferrin saturation.', null, 'iron', 'NOT_ESTABLISHED'],
  ['transferrin', 'Transferrin', 'mg/dL', null, null, ['transferrin'], 'IRON_STATUS', 'serum', 'SPECIALIZED', false, 'Iron-transport protein.', null, 'iron', 'NOT_ESTABLISHED'],
  ['transferrin_saturation', 'Transferrin Saturation', '%', null, null, ['transferrin saturation', 'tsat', 'iron saturation'], 'IRON_STATUS', 'serum', 'SPECIALIZED', false, 'Calculated transparently as Serum Iron / TIBC x 100 when both values are available.', null, 'iron', 'NOT_ESTABLISHED'],

  ['hemoglobin', 'Hemoglobin', 'g/dL', null, null, ['hemoglobin', 'hgb', 'hb'], 'HEMATOLOGY', 'whole_blood', 'ROUTINE', false, 'Routine/common CBC component.', null, null, 'NOT_ESTABLISHED'],
  ['hematocrit', 'Hematocrit', '%', null, null, ['hematocrit', 'hct'], 'HEMATOLOGY', 'whole_blood', 'ROUTINE', false, 'Routine/common CBC component.', null, null, 'NOT_ESTABLISHED'],
  ['mcv', 'MCV', 'fL', null, null, ['mcv', 'mean corpuscular volume'], 'HEMATOLOGY', 'whole_blood', 'ROUTINE', false, 'Routine/common CBC component; macrocytosis can accompany B12/folate deficiency.', null, null, 'NOT_ESTABLISHED'],
  ['mch', 'MCH', 'pg', null, null, ['mch'], 'HEMATOLOGY', 'whole_blood', 'ROUTINE', false, 'Routine/common CBC component.', null, null, 'NOT_ESTABLISHED'],
  ['mchc', 'MCHC', 'g/dL', null, null, ['mchc'], 'HEMATOLOGY', 'whole_blood', 'ROUTINE', false, 'Routine/common CBC component.', null, null, 'NOT_ESTABLISHED'],
  ['rdw', 'RDW', '%', null, null, ['rdw', 'red cell distribution width'], 'HEMATOLOGY', 'whole_blood', 'ROUTINE', false, 'Routine/common CBC component.', null, null, 'NOT_ESTABLISHED'],
  ['rbc', 'RBC Count', 'x10^6/µL', null, null, ['rbc', 'red blood cell count'], 'HEMATOLOGY', 'whole_blood', 'ROUTINE', false, 'Routine/common CBC component.', null, null, 'NOT_ESTABLISHED'],
  ['wbc', 'WBC Count', 'x10^3/µL', null, null, ['wbc', 'white blood cell count'], 'HEMATOLOGY', 'whole_blood', 'ROUTINE', false, 'Routine/common CBC component.', null, null, 'NOT_ESTABLISHED'],

  ['mma', 'Methylmalonic Acid (MMA)', 'µmol/L', null, 0.271, ['mma', 'methylmalonic acid'], 'FUNCTIONAL_NUTRIENT_MARKERS', 'serum', 'SPECIALIZED', true, 'Functional marker of B12 status at the tissue level; affected by renal impairment.', null, 'vitamin_b12', 'CLINICAL_INTERPRETATION'],
  ['homocysteine', 'Homocysteine', 'µmol/L', null, 15, ['homocysteine', 'hcy'], 'FUNCTIONAL_NUTRIENT_MARKERS', 'plasma', 'SELECTIVE', true, 'Elevated levels may suggest B12, folate, or B6 insufficiency -- interpret together with those markers.', null, null, 'CLINICAL_INTERPRETATION'],
  ['albumin', 'Albumin', 'g/dL', null, null, ['albumin'], 'FUNCTIONAL_NUTRIENT_MARKERS', 'serum', 'ROUTINE', false, 'General nutritional/hepatic marker; also used to correct total calcium.', null, null, 'NOT_ESTABLISHED'],
  ['creatinine', 'Creatinine', 'mg/dL', null, null, ['creatinine'], 'FUNCTIONAL_NUTRIENT_MARKERS', 'serum', 'ROUTINE', false, 'Used with eGFR to derive renal function context for magnesium/MMA interpretation.', null, null, 'NOT_ESTABLISHED'],
  ['egfr', 'eGFR', 'mL/min/1.73m2', null, null, ['egfr', 'estimated gfr'], 'FUNCTIONAL_NUTRIENT_MARKERS', 'serum', 'ROUTINE', false, 'Used to derive renal-impairment context live from recent results.', null, null, 'NOT_ESTABLISHED'],

  ['fasting_glucose', 'Fasting Glucose', 'mg/dL', null, null, ['fasting glucose', 'glucose'], 'METABOLIC', 'serum', 'ROUTINE', false, 'Cardiometabolic marker -- NOT a vitamin/nutrient deficiency test.', null, null, 'NOT_ESTABLISHED'],
  ['hba1c', 'HbA1c', '%', null, null, ['hba1c', 'a1c', 'glycated hemoglobin'], 'METABOLIC', 'whole_blood', 'ROUTINE', false, 'Cardiometabolic marker -- NOT a vitamin/nutrient deficiency test.', null, null, 'NOT_ESTABLISHED'],
  ['ldl_c', 'LDL Cholesterol', 'mg/dL', null, null, ['ldl', 'ldl-c', 'ldl cholesterol'], 'METABOLIC', 'serum', 'ROUTINE', false, 'Cardiometabolic marker -- NOT a vitamin/nutrient deficiency test.', null, null, 'NOT_ESTABLISHED'],
  ['hdl_c', 'HDL Cholesterol', 'mg/dL', null, null, ['hdl', 'hdl-c', 'hdl cholesterol'], 'METABOLIC', 'serum', 'ROUTINE', false, 'Cardiometabolic marker -- NOT a vitamin/nutrient deficiency test.', null, null, 'NOT_ESTABLISHED'],
  ['triglycerides', 'Triglycerides', 'mg/dL', null, null, ['triglycerides', 'tg'], 'METABOLIC', 'serum', 'ROUTINE', false, 'Cardiometabolic marker -- NOT a vitamin/nutrient deficiency test. High triglycerides must never be interpreted as an omega-3 deficiency.', null, null, 'NOT_ESTABLISHED'],
  ['non_hdl_cholesterol', 'Non-HDL Cholesterol', 'mg/dL', null, null, ['non-hdl cholesterol', 'non hdl'], 'METABOLIC', 'serum', 'ROUTINE', false, 'Cardiometabolic marker -- NOT a vitamin/nutrient deficiency test.', null, null, 'NOT_ESTABLISHED'],

  ['tsh', 'TSH', 'µIU/mL', null, null, ['tsh', 'thyroid stimulating hormone'], 'THYROID', 'serum', 'SELECTIVE', false, 'Thyroid function marker -- NOT a nutrient-deficiency test. Never auto-recommend iodine or selenium from this result.', null, null, 'NOT_ESTABLISHED'],
  ['free_t4', 'Free T4', 'ng/dL', null, null, ['free t4', 'ft4'], 'THYROID', 'serum', 'SELECTIVE', false, 'Thyroid function marker -- NOT a nutrient-deficiency test.', null, null, 'NOT_ESTABLISHED'],
  ['free_t3', 'Free T3', 'pg/mL', null, null, ['free t3', 'ft3'], 'THYROID', 'serum', 'SELECTIVE', false, 'Thyroid function marker -- NOT a nutrient-deficiency test.', null, null, 'NOT_ESTABLISHED'],

  ['pth', 'Parathyroid Hormone (PTH)', 'pg/mL', null, null, ['pth', 'parathyroid hormone'], 'BONE_MINERAL', 'serum', 'SPECIALIZED', true, 'Interpret together with vitamin D, calcium and phosphate. Low vitamin D with elevated PTH should prompt review of vitamin D/calcium status, not a diagnosis of hyperparathyroidism.', null, null, 'NOT_ESTABLISHED'],
  ['crp', 'C-Reactive Protein (CRP)', 'mg/L', null, null, ['crp', 'c-reactive protein'], 'OTHER', 'serum', 'SELECTIVE', false, 'Used to derive an inflammation context flag -- ferritin may be falsely elevated when CRP is high.', null, null, 'NOT_ESTABLISHED'],
];

// ---------------------------------------------------------------------------
// Versioned interpretation rules -- only for tests with an explicit numeric
// threshold given for this feature. Operator semantics (see labRuleEngine.js):
//   lt(high): value < high        lte(high): value <= high
//   gt(low):  value > low         gte(low):  value >= low
//   between(low, high): low <= value < high   (low inclusive, high exclusive)
// ---------------------------------------------------------------------------
const rules = [
  // Vitamin D (ng/mL) -- NIH ODS
  { test: 'vitamin_d', ev: 'vitamin_d', op: 'lt', high: 12, severity: 'DEFICIENT', label: 'Deficient', message: 'Below 12 ng/mL suggests vitamin D deficiency (NIH ODS reference).', action: 'Consider discussing vitamin D repletion with the pharmacist/clinician.', review: true, priority: 10 },
  { test: 'vitamin_d', ev: 'vitamin_d', op: 'between', low: 12, high: 20, severity: 'LOW', label: 'Potentially inadequate', message: '12-<20 ng/mL is considered potentially inadequate for bone/overall health (NIH ODS reference).', action: 'Consider discussing vitamin D status with the pharmacist/clinician.', review: false, priority: 9 },
  { test: 'vitamin_d', ev: 'vitamin_d', op: 'between', low: 20, high: 50, severity: 'ADEQUATE', label: 'Generally adequate', message: '20-<50 ng/mL is generally considered adequate for most people (NIH ODS reference).', action: null, review: false, priority: 8 },
  { test: 'vitamin_d', ev: 'vitamin_d', op: 'gte', low: 50, severity: 'REVIEW', label: 'Above typical range', message: 'At or above 50 ng/mL warrants clinical review, particularly if the patient is supplementing.', action: 'Review vitamin D intake/supplementation with the pharmacist/clinician.', review: true, priority: 7 },

  // Vitamin B12 (pg/mL)
  { test: 'vitamin_b12', ev: 'vitamin_b12', op: 'lt', high: 150, severity: 'LOW', label: 'Low', message: 'Below 150 pg/mL is low.', action: 'Consider clinical evaluation; MMA testing may help confirm functional B12 status.', related: 'mma', review: true, priority: 10 },
  { test: 'vitamin_b12', ev: 'vitamin_b12', op: 'between', low: 150, high: 400, severity: 'BORDERLINE', label: 'Borderline', message: 'Between 150 and 399 pg/mL is borderline.', action: 'Consider methylmalonic acid (MMA) testing if clinically indicated.', related: 'mma', review: true, priority: 9 },
  { test: 'vitamin_b12', ev: 'vitamin_b12', op: 'gte', low: 400, severity: 'ADEQUATE', label: 'Adequate', message: 'At or above 400 pg/mL is adequate.', action: null, review: false, priority: 8 },

  // Folate serum (ng/mL): >3 adequate else low
  { test: 'folate', ev: 'folate', op: 'lte', high: 3, severity: 'LOW', label: 'Low', message: 'At or below 3 ng/mL is low.', action: 'Consider dietary folate sources; discuss with the pharmacist/clinician.', review: false, priority: 10 },
  { test: 'folate', ev: 'folate', op: 'gt', low: 3, severity: 'ADEQUATE', label: 'Adequate', message: 'Above 3 ng/mL is adequate.', action: null, review: false, priority: 9 },

  // Folate RBC (ng/mL RBC): >140 adequate else low
  { test: 'folate_rbc', ev: 'folate', op: 'lte', high: 140, severity: 'LOW', label: 'Low', message: 'At or below 140 ng/mL is low.', action: 'Consider dietary folate sources; discuss with the pharmacist/clinician.', review: false, priority: 10 },
  { test: 'folate_rbc', ev: 'folate', op: 'gt', low: 140, severity: 'ADEQUATE', label: 'Adequate', message: 'Above 140 ng/mL is adequate.', action: null, review: false, priority: 9 },

  // Vitamin B6 / PLP (nmol/L): >=20 adequate else low
  { test: 'vitamin_b6_plp', ev: 'vitamin_b6', op: 'lt', high: 20, severity: 'LOW', label: 'Low', message: 'Below 20 nmol/L is low.', action: 'Discuss dietary B6 sources with the pharmacist/clinician. Avoid high-dose B6 supplementation.', review: false, priority: 10 },
  { test: 'vitamin_b6_plp', ev: 'vitamin_b6', op: 'gte', low: 20, severity: 'ADEQUATE', label: 'Adequate', message: 'At or above 20 nmol/L is adequate.', action: null, review: false, priority: 9 },

  // Zinc (mcg/dL), sex-conditional
  { test: 'zinc', ev: 'zinc', op: 'lt', high: 70, sex: 'female', severity: 'LOW', label: 'Low', message: 'Below 70 mcg/dL is low for a female patient.', action: 'Consider dietary zinc sources; discuss with the pharmacist/clinician.', review: false, priority: 10 },
  { test: 'zinc', ev: 'zinc', op: 'gte', low: 70, sex: 'female', severity: 'ADEQUATE', label: 'Adequate', message: 'At or above 70 mcg/dL is adequate for a female patient.', action: null, review: false, priority: 9 },
  { test: 'zinc', ev: 'zinc', op: 'lt', high: 74, sex: 'male', severity: 'LOW', label: 'Low', message: 'Below 74 mcg/dL is low for a male patient.', action: 'Consider dietary zinc sources; discuss with the pharmacist/clinician.', review: false, priority: 10 },
  { test: 'zinc', ev: 'zinc', op: 'gte', low: 74, sex: 'male', severity: 'ADEQUATE', label: 'Adequate', message: 'At or above 74 mcg/dL is adequate for a male patient.', action: null, review: false, priority: 9 },

  // Ferritin (ng/mL): <30 possible deficiency, <10 strongly suggestive, else adequate
  { test: 'ferritin', ev: 'iron', op: 'lt', high: 10, severity: 'DEFICIENT', label: 'Strongly suggestive of deficiency', message: 'Below 10 ng/mL is strongly suggestive of iron deficiency.', action: 'Iron findings should be reviewed by the pharmacist/clinician before any iron supplementation is considered.', related: 'transferrin_saturation', review: true, priority: 10 },
  { test: 'ferritin', ev: 'iron', op: 'between', low: 10, high: 30, severity: 'LOW', label: 'Possible deficiency', message: '10-<30 ng/mL indicates possible iron deficiency.', action: 'Iron findings should be reviewed by the pharmacist/clinician before any iron supplementation is considered.', related: 'transferrin_saturation', review: true, priority: 9 },
  { test: 'ferritin', ev: 'iron', op: 'gte', low: 30, severity: 'ADEQUATE', label: 'No evidence of deficiency by ferritin alone', message: 'At or above 30 ng/mL shows no biochemical evidence of iron deficiency by ferritin alone. Ferritin can be falsely elevated by inflammation.', action: null, review: false, priority: 8 },

  // MMA (µmol/L): >0.271 suggests B12 deficiency
  { test: 'mma', ev: 'vitamin_b12', op: 'lte', high: 0.271, severity: 'NORMAL', label: 'Not elevated', message: 'At or below 0.271 µmol/L is not elevated.', action: null, review: false, priority: 9 },
  { test: 'mma', ev: 'vitamin_b12', op: 'gt', low: 0.271, severity: 'HIGH', label: 'Elevated', message: 'Above 0.271 µmol/L is elevated and may suggest functional vitamin B12 deficiency at the tissue level. MMA can also be affected by renal impairment.', action: 'Correlate with serum B12 and renal function; consider clinical review.', related: 'vitamin_b12', review: true, priority: 10 },

  // Homocysteine (µmol/L): >15 may suggest B12 deficiency
  { test: 'homocysteine', ev: 'vitamin_b12', op: 'lte', high: 15, severity: 'NORMAL', label: 'Not elevated', message: 'At or below 15 µmol/L is not elevated.', action: null, review: false, priority: 9 },
  { test: 'homocysteine', ev: 'vitamin_b12', op: 'gt', low: 15, severity: 'HIGH', label: 'Elevated', message: 'Above 15 µmol/L is elevated and may suggest B12, folate, or B6 insufficiency. Interpret together with those markers.', action: 'Correlate with B12, folate and B6 status; consider clinical review.', related: 'vitamin_b12', review: true, priority: 10 },

  // Selenium (µg/dL): >=8 generally sufficient (lower bound only)
  { test: 'selenium', ev: 'selenium', op: 'lt', high: 8, severity: 'LOW', label: 'Potentially insufficient', message: 'Below 8 µg/dL is potentially insufficient.', action: 'Consider dietary selenium sources; discuss supplementation with the pharmacist/clinician.', review: false, priority: 10 },
  { test: 'selenium', ev: 'selenium', op: 'gte', low: 8, severity: 'ADEQUATE', label: 'Generally sufficient', message: 'At or above 8 µg/dL is generally sufficient. No upper-bound nutritional interpretation is encoded for this test -- high-dose selenium requires review.', action: null, review: false, priority: 9 },
];

// ---------------------------------------------------------------------------
// Nutrient <-> test relations
// ---------------------------------------------------------------------------
const nutrientRelations = [
  ['vitamin_d', 'vitamin_d', 'DIRECT_STATUS_MARKER'],
  ['vitamin_b12', 'vitamin_b12', 'DIRECT_STATUS_MARKER'],
  ['folate', 'folate', 'DIRECT_STATUS_MARKER'],
  ['folate_rbc', 'folate', 'RELATED_MARKER'],
  ['vitamin_b6_plp', 'vitamin_b6', 'DIRECT_STATUS_MARKER'],
  ['vitamin_a_retinol', 'vitamin_a', 'DIRECT_STATUS_MARKER'],
  ['vitamin_c', 'vitamin_c', 'DIRECT_STATUS_MARKER'],
  ['vitamin_e', 'vitamin_e', 'DIRECT_STATUS_MARKER'],
  ['vitamin_b1_thiamine', 'vitamin_b1', 'DIRECT_STATUS_MARKER'],
  ['pt_inr', 'vitamin_k', 'FUNCTIONAL_MARKER'],
  ['calcium', 'calcium', 'DIRECT_STATUS_MARKER'],
  ['calcium_ionized', 'calcium', 'FUNCTIONAL_MARKER'],
  ['magnesium', 'magnesium', 'DIRECT_STATUS_MARKER'],
  ['zinc', 'zinc', 'DIRECT_STATUS_MARKER'],
  ['copper', 'copper', 'DIRECT_STATUS_MARKER'],
  ['ceruloplasmin', 'copper', 'RELATED_MARKER'],
  ['selenium', 'selenium', 'DIRECT_STATUS_MARKER'],
  ['phosphate', 'phosphorus', 'DIRECT_STATUS_MARKER'],
  ['potassium', 'potassium', 'DIRECT_STATUS_MARKER'],
  ['ferritin', 'iron', 'DIRECT_STATUS_MARKER'],
  ['serum_iron', 'iron', 'RELATED_MARKER'],
  ['tibc', 'iron', 'CONFOUNDING_FACTOR'],
  ['transferrin', 'iron', 'RELATED_MARKER'],
  ['transferrin_saturation', 'iron', 'RELATED_MARKER'],
  ['mma', 'vitamin_b12', 'FUNCTIONAL_MARKER'],
  ['homocysteine', 'folate', 'FUNCTIONAL_MARKER'],
  ['homocysteine', 'vitamin_b12', 'FUNCTIONAL_MARKER'],
  ['homocysteine', 'vitamin_b6', 'FUNCTIONAL_MARKER'],
];

// ---------------------------------------------------------------------------
// Test <-> test relations ("related tests")
// ---------------------------------------------------------------------------
const testRelations = [
  ['vitamin_b12', 'mma', 'FOLLOW_UP', 'Low/borderline B12 with elevated MMA supports a functional deficiency.'],
  ['vitamin_b12', 'homocysteine', 'FOLLOW_UP', 'Elevated homocysteine can accompany B12 insufficiency.'],
  ['vitamin_d', 'calcium', 'RELATED', 'Vitamin D and calcium status are physiologically linked.'],
  ['vitamin_d', 'pth', 'RELATED', 'Low vitamin D with elevated PTH should prompt review of vitamin D/calcium status and clinical context -- not a diagnosis.'],
  ['vitamin_d', 'phosphate', 'RELATED', 'Vitamin D influences phosphate handling.'],
  ['vitamin_d', 'magnesium', 'RELATED', 'Magnesium is a cofactor in vitamin D metabolism.'],
  ['ferritin', 'hemoglobin', 'RELATED', 'Part of the full iron-status picture alongside CBC.'],
  ['ferritin', 'serum_iron', 'RELATED', 'Part of the full iron panel.'],
  ['ferritin', 'tibc', 'RELATED', 'Part of the full iron panel.'],
  ['ferritin', 'transferrin_saturation', 'RELATED', 'Part of the full iron panel.'],
  ['zinc', 'copper', 'CONFOUNDING', 'Prolonged high-dose zinc use can lower copper status.'],
  ['folate', 'homocysteine', 'FOLLOW_UP', 'Low folate can accompany elevated homocysteine.'],
  ['calcium', 'pth', 'RELATED', 'Calcium and PTH regulate one another.'],
  ['magnesium', 'potassium', 'RELATED', 'Magnesium and potassium homeostasis are linked.'],
  ['magnesium', 'calcium', 'RELATED', 'Magnesium and calcium homeostasis are linked.'],
];

// ---------------------------------------------------------------------------
// Supplement recommendation rules -- never a dose; always "discuss with
// pharmacist/clinician." trigger_severity matches lab_interpretation_rules.severity.
// ---------------------------------------------------------------------------
const recommendationRules = [
  ['vitamin_d', 'vitamin_d', 'DEFICIENT', 'OTC_SUPPLEMENT_CONSIDERATION', 'Consider discussing vitamin D repletion options with the pharmacist; dosing should be individualized.', 'High-dose vitamin D should not be recommended without review (risk of hypercalcemia with prolonged high-dose use).', true, false],
  ['vitamin_d', 'vitamin_d', 'LOW', 'OTC_SUPPLEMENT_CONSIDERATION', 'Consider discussing vitamin D status and dietary/supplement options with the pharmacist.', 'High-dose vitamin D should not be recommended without review.', true, false],
  ['vitamin_b12', 'vitamin_b12', 'LOW', 'MEDICAL_REVIEW', 'Consider clinical evaluation of B12 status; MMA testing may help confirm a functional deficiency.', null, true, false],
  ['vitamin_b12', 'vitamin_b12', 'BORDERLINE', 'FOLLOW_UP_TEST', 'Consider methylmalonic acid (MMA) testing if clinically indicated.', null, true, false],
  ['folate', 'folate', 'LOW', 'DIETARY', 'Consider dietary folate sources; discuss supplementation with the pharmacist.', 'If B12 status is unknown, evaluate B12 before folate supplementation -- folate can mask B12-deficiency-related macrocytosis/anemia.', true, false],
  ['zinc', 'zinc', 'LOW', 'OTC_SUPPLEMENT_CONSIDERATION', 'Consider dietary zinc sources; discuss supplementation with the pharmacist.', 'Avoid prolonged high-dose zinc without review -- may cause copper deficiency.', true, false],
  ['ferritin', 'iron', 'LOW', 'MEDICAL_REVIEW', 'Iron status findings should be reviewed by the pharmacist/clinician before any iron supplementation is considered.', 'Iron should never be auto-recommended; overdose risk, especially in children.', true, true],
  ['ferritin', 'iron', 'DEFICIENT', 'MEDICAL_REVIEW', 'Iron status findings should be reviewed by the pharmacist/clinician before any iron supplementation is considered.', 'Iron should never be auto-recommended; overdose risk, especially in children.', true, true],
  ['selenium', 'selenium', 'LOW', 'OTC_SUPPLEMENT_CONSIDERATION', 'Consider dietary selenium sources; discuss supplementation with the pharmacist.', 'High-dose selenium requires review -- narrow safety margin.', true, false],
  ['vitamin_b6_plp', 'vitamin_b6', 'LOW', 'DIETARY', 'Consider dietary B6 sources; discuss with the pharmacist.', 'Avoid high-dose vitamin B6 supplementation -- associated with peripheral neuropathy.', true, false],
  ['magnesium', 'magnesium', 'LOW', 'OTC_SUPPLEMENT_CONSIDERATION', 'Consider dietary magnesium sources; discuss supplementation with the pharmacist.', 'Use caution in renal impairment -- magnesium supplementation requires review if renal function is reduced.', true, false],
  [null, 'vitamin_a', 'ANY', 'NO_AUTOMATIC_RECOMMENDATION', 'Vitamin A status requires clinical review before any recommendation.', 'Never auto-recommend high-dose vitamin A; teratogenic risk requires clinician review in pregnancy.', true, true],
  [null, 'potassium', 'ANY', 'NO_AUTOMATIC_RECOMMENDATION', 'Potassium status requires clinical review; potassium supplementation must never be auto-recommended.', null, true, true],
  [null, 'copper', 'ANY', 'NO_AUTOMATIC_RECOMMENDATION', 'Copper supplementation requires clinical review.', null, true, false],
  [null, 'calcium', 'HIGH', 'NO_AUTOMATIC_RECOMMENDATION', 'High-dose calcium supplementation requires clinical review.', null, true, false],
];

// ---------------------------------------------------------------------------
// Safety flags (section 11 + biotin/omega-3 handling)
// ---------------------------------------------------------------------------
const safetyFlags = [
  ['iron', null, 'GENERAL', 'Never auto-recommend iron supplementation without clinical review -- overdose risk.'],
  ['vitamin_a', null, 'PREGNANCY', 'Vitamin A (especially high-dose/retinol) requires clinician review before any recommendation in pregnancy -- teratogenicity risk.'],
  ['vitamin_a', null, 'GENERAL', 'Never auto-recommend high-dose vitamin A.'],
  ['vitamin_d', null, 'PROLONGED_HIGH_DOSE', 'High-dose vitamin D requires review -- risk of hypercalcemia with prolonged high-dose use.'],
  ['copper', null, 'GENERAL', 'Never auto-recommend copper supplementation without review.'],
  ['selenium', null, 'GENERAL', 'Never auto-recommend high-dose selenium -- narrow margin between adequate and excessive intake.'],
  ['potassium', null, 'GENERAL', 'Never auto-recommend potassium supplementation.'],
  ['calcium', null, 'PROLONGED_HIGH_DOSE', 'High-dose calcium supplementation requires clinical review.'],
  ['zinc', null, 'PROLONGED_HIGH_DOSE', 'Prolonged high-dose zinc use is associated with copper-deficiency risk.'],
  ['magnesium', null, 'RENAL_IMPAIRMENT', 'Use caution recommending magnesium supplementation in renal impairment.'],
  ['vitamin_b6', null, 'GENERAL', 'Avoid high-dose vitamin B6 supplementation -- associated with peripheral neuropathy.'],
  ['folate', 'folate', 'GENERAL', 'Folate supplementation should prompt evaluation of vitamin B12 status when B12 is unknown, especially with macrocytosis or anemia -- folate can mask B12 deficiency.'],
  ['vitamin_b12', 'vitamin_b12', 'GENERAL', 'Borderline B12 results should prompt consideration of methylmalonic acid (MMA) testing.'],
  ['vitamin_b12', 'mma', 'RENAL_IMPAIRMENT', 'MMA can be affected by renal impairment; interpret with renal function in mind.'],
  ['iron', 'ferritin', 'INFLAMMATION', 'Ferritin may be falsely elevated by inflammation/acute phase response -- interpret with CRP or other inflammation markers when available.'],
  ['biotin', null, 'GENERAL', 'High-dose biotin supplementation can interfere with certain laboratory immunoassays (e.g. thyroid function tests) -- ask about biotin use before interpreting affected labs.'],
];

async function upsertEvidenceSources() {
  const ids = {};
  for (const [key, ev] of evidenceSources) {
    const { rows } = await pool.query(
      `INSERT INTO evidence_sources (organization, title, url, evidence_level)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [ev.organization, ev.title, ev.url, ev.evidence_level]
    );
    if (rows[0]) {
      ids[key] = rows[0].id;
    } else {
      const existing = await pool.query('SELECT id FROM evidence_sources WHERE title = $1', [ev.title]);
      ids[key] = existing.rows[0]?.id;
    }
  }
  return ids;
}

async function upsertNutrients() {
  for (const [key, name, type, safetyNotes] of nutrients) {
    await pool.query(
      `INSERT INTO nutrients (key, name, type, safety_notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, safety_notes = EXCLUDED.safety_notes`,
      [key, name, type, safetyNotes]
    );
  }
}

async function upsertTestTypes() {
  for (const t of testTypes) {
    const [key, label, unit, refLow, refHigh, aliases, category, specimen, routineStatus, requiresContext, description, altUnits, nutrientKey, refRangeType] = t;
    await pool.query(
      `INSERT INTO lab_test_types (key, label, unit, ref_low, ref_high, aliases, category, specimen, routine_status, requires_clinical_context, description, alternative_units, nutrient_key, reference_range_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (key) DO UPDATE SET
         category = EXCLUDED.category,
         specimen = EXCLUDED.specimen,
         routine_status = EXCLUDED.routine_status,
         requires_clinical_context = EXCLUDED.requires_clinical_context,
         description = EXCLUDED.description,
         alternative_units = EXCLUDED.alternative_units,
         nutrient_key = EXCLUDED.nutrient_key,
         reference_range_type = EXCLUDED.reference_range_type`,
      [key, label, unit, refLow, refHigh, aliases, category, specimen, routineStatus, requiresContext, description, altUnits ? JSON.stringify(altUnits) : null, nutrientKey, refRangeType]
    );
  }
}

async function insertInterpretationRules(evidenceIds) {
  for (const r of rules) {
    const existing = await pool.query(
      `SELECT id FROM lab_interpretation_rules WHERE lab_test_key = $1 AND severity = $2 AND operator = $3
         AND COALESCE(threshold_low, -999999::numeric) = COALESCE($4::numeric, -999999::numeric)
         AND COALESCE(threshold_high, -999999::numeric) = COALESCE($5::numeric, -999999::numeric)
         AND COALESCE(applies_sex, '') = COALESCE($6, '')`,
      [r.test, r.severity, r.op, r.low ?? null, r.high ?? null, r.sex ?? null]
    );
    if (existing.rows.length > 0) continue;

    await pool.query(
      `INSERT INTO lab_interpretation_rules
         (lab_test_key, version, operator, threshold_low, threshold_high, severity, label, message, recommended_action, requires_review, applies_sex, priority, evidence_source_id, reviewed_by, reviewed_at, notes)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), $14)`,
      [
        r.test, r.op, r.low ?? null, r.high ?? null, r.severity, r.label, r.message, r.action ?? null,
        !!r.review, r.sex ?? null, r.priority ?? 0, evidenceIds[r.ev] ?? null, 'system-seed',
        r.related ? `Related test: ${r.related}` : null,
      ]
    );
  }
}

async function insertRelations() {
  for (const [testKey, nutrientKey, type] of nutrientRelations) {
    await pool.query(
      `INSERT INTO lab_test_nutrient_relations (lab_test_key, nutrient_key, relationship_type)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (
         SELECT 1 FROM lab_test_nutrient_relations WHERE lab_test_key = $1 AND nutrient_key = $2 AND relationship_type = $3
       )`,
      [testKey, nutrientKey, type]
    );
  }
  for (const [testKey, relatedKey, type, description] of testRelations) {
    await pool.query(
      `INSERT INTO lab_test_relations (lab_test_key, related_lab_test_key, relationship_type, description)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (
         SELECT 1 FROM lab_test_relations WHERE lab_test_key = $1 AND related_lab_test_key = $2
       )`,
      [testKey, relatedKey, type, description]
    );
  }
}

async function insertRecommendationRules(evidenceIds) {
  for (const [testKey, nutrientKey, triggerSeverity, type, text, safetyWarning, needsPharmacist, needsPhysician] of recommendationRules) {
    await pool.query(
      `INSERT INTO supplement_recommendation_rules
         (lab_test_key, nutrient_key, trigger_severity, recommendation_type, recommendation_text, safety_warning, requires_pharmacist_review, requires_physician_review, evidence_source_id)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
       WHERE NOT EXISTS (
         SELECT 1 FROM supplement_recommendation_rules
         WHERE COALESCE(lab_test_key, '') = COALESCE($1, '') AND nutrient_key = $2 AND trigger_severity = $3
       )`,
      [testKey, nutrientKey, triggerSeverity, type, text, safetyWarning, needsPharmacist, needsPhysician, evidenceIds[nutrientKey] ?? null]
    );
  }
}

async function insertSafetyFlags() {
  for (const [nutrientKey, testKey, conditionType, warningText] of safetyFlags) {
    await pool.query(
      `INSERT INTO lab_safety_flags (nutrient_key, lab_test_key, condition_type, warning_text)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (
         SELECT 1 FROM lab_safety_flags
         WHERE nutrient_key = $1 AND COALESCE(lab_test_key, '') = COALESCE($2, '') AND condition_type = $3
       )`,
      [nutrientKey, testKey, conditionType, warningText]
    );
  }
}

async function seedLabClinical() {
  console.log('Seeding evidence sources...');
  const evidenceIds = await upsertEvidenceSources();
  console.log('Seeding nutrients...');
  await upsertNutrients();
  console.log('Seeding/backfilling lab test catalog...');
  await upsertTestTypes();
  console.log('Seeding interpretation rules...');
  await insertInterpretationRules(evidenceIds);
  console.log('Seeding nutrient/test relations...');
  await insertRelations();
  console.log('Seeding supplement recommendation rules...');
  await insertRecommendationRules(evidenceIds);
  console.log('Seeding safety flags...');
  await insertSafetyFlags();
  console.log('Laboratory & Nutritional Assessment seed complete.');
  await pool.end();
}

seedLabClinical().catch((err) => {
  console.error('Lab clinical seed failed:', err);
  process.exit(1);
});

-- Laboratory & Nutritional Assessment module. Extends the existing lab
-- tables (lab_test_types, lab_result_markers) rather than replacing them;
-- adds new tables only for genuinely new concepts (nutrients, versioned
-- interpretation rules, evidence sources, safety flags, relations, audit
-- log). This is a pharmacist DECISION-SUPPORT tool: it never diagnoses,
-- never auto-prescribes, and never auto-recommends a dose.

ALTER TABLE patients ADD COLUMN IF NOT EXISTS sex TEXT; -- male | female | other, nullable

-- Extend the existing test catalog with category/specimen/routine metadata.
ALTER TABLE lab_test_types ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'OTHER';
ALTER TABLE lab_test_types ADD COLUMN IF NOT EXISTS specimen TEXT;
ALTER TABLE lab_test_types ADD COLUMN IF NOT EXISTS routine_status TEXT DEFAULT 'SELECTIVE'; -- ROUTINE | SELECTIVE | SPECIALIZED | NOT_ROUTINE_SCREENING
ALTER TABLE lab_test_types ADD COLUMN IF NOT EXISTS requires_clinical_context BOOLEAN DEFAULT false;
ALTER TABLE lab_test_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE lab_test_types ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE lab_test_types ADD COLUMN IF NOT EXISTS alternative_units JSONB; -- e.g. [{"unit":"nmol/L","factor":2.5}] (multiply canonical value by factor to get this unit)
ALTER TABLE lab_test_types ADD COLUMN IF NOT EXISTS nutrient_key TEXT; -- which nutrient this is the direct status marker for, if any
ALTER TABLE lab_test_types ADD COLUMN IF NOT EXISTS reference_range_type TEXT DEFAULT 'NOT_ESTABLISHED'; -- LAB_PROVIDED | STANDARD_REFERENCE | CLINICAL_INTERPRETATION | NOT_ESTABLISHED (default before any lab-provided range is entered)

CREATE TABLE IF NOT EXISTS nutrients (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- VITAMIN | MINERAL | OTHER_NUTRIENT
  description TEXT,
  common_food_sources TEXT,
  supplement_category TEXT, -- matches products.category for the "products containing X" lookup
  upper_limit_notes TEXT,
  safety_notes TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence_sources (
  id SERIAL PRIMARY KEY,
  organization TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  publication_date DATE,
  last_reviewed DATE,
  evidence_level TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- Multi-band, versioned interpretation thresholds -- replaces the old
-- single ref_low/ref_high pair on lab_test_types with real support for
-- deficient/borderline/adequate/high bands per test. Changing a threshold
-- inserts a new row (new version) rather than editing in place, so a
-- historical result keeps the rule that was actually active when it was
-- entered (lab_result_markers.interpretation_rule_id records which one).
CREATE TABLE IF NOT EXISTS lab_interpretation_rules (
  id SERIAL PRIMARY KEY,
  lab_test_key TEXT NOT NULL REFERENCES lab_test_types(key),
  version INTEGER NOT NULL DEFAULT 1,
  operator TEXT NOT NULL, -- lt | lte | between | gt | gte
  threshold_low NUMERIC,
  threshold_high NUMERIC,
  threshold_unit TEXT,
  severity TEXT NOT NULL, -- DEFICIENT | LOW | BORDERLINE | ADEQUATE | NORMAL | HIGH | CRITICAL | REVIEW | UNKNOWN
  label TEXT NOT NULL, -- short badge text, e.g. "Potentially inadequate"
  message TEXT NOT NULL,
  recommended_action TEXT,
  requires_review BOOLEAN DEFAULT false,
  applies_sex TEXT, -- male | female | null (any)
  applies_min_age NUMERIC,
  applies_max_age NUMERIC,
  applies_pregnancy BOOLEAN, -- true = only when pregnant, false = only when not, null = doesn't matter
  priority INTEGER DEFAULT 0,
  evidence_source_id INTEGER REFERENCES evidence_sources(id),
  active BOOLEAN DEFAULT true,
  reviewed_by TEXT,
  reviewed_at TIMESTAMP,
  effective_from TIMESTAMP DEFAULT now(),
  effective_until TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_test_nutrient_relations (
  id SERIAL PRIMARY KEY,
  lab_test_key TEXT NOT NULL REFERENCES lab_test_types(key),
  nutrient_key TEXT NOT NULL REFERENCES nutrients(key),
  relationship_type TEXT NOT NULL -- DIRECT_STATUS_MARKER | FUNCTIONAL_MARKER | RELATED_MARKER | CONFOUNDING_FACTOR | FOLLOW_UP_MARKER
);

CREATE TABLE IF NOT EXISTS lab_test_relations (
  id SERIAL PRIMARY KEY,
  lab_test_key TEXT NOT NULL REFERENCES lab_test_types(key),
  related_lab_test_key TEXT NOT NULL REFERENCES lab_test_types(key),
  relationship_type TEXT,
  description TEXT
);

-- Never a dose. recommendation_text stays at the level of "consider
-- discussing X with the pharmacist/clinician" -- enforced by seed content,
-- not by the schema, so this is a content discipline, not a code check.
CREATE TABLE IF NOT EXISTS supplement_recommendation_rules (
  id SERIAL PRIMARY KEY,
  lab_test_key TEXT REFERENCES lab_test_types(key),
  nutrient_key TEXT REFERENCES nutrients(key),
  trigger_severity TEXT NOT NULL, -- which severity level(s) this applies to, e.g. 'LOW'
  recommendation_type TEXT NOT NULL, -- DIETARY | OTC_SUPPLEMENT_CONSIDERATION | FOLLOW_UP_TEST | MEDICAL_REVIEW | NO_AUTOMATIC_RECOMMENDATION
  recommendation_text TEXT NOT NULL,
  safety_warning TEXT,
  requires_pharmacist_review BOOLEAN DEFAULT true,
  requires_physician_review BOOLEAN DEFAULT false,
  evidence_source_id INTEGER REFERENCES evidence_sources(id),
  active BOOLEAN DEFAULT true
);

-- Cross-cutting safety warnings tied to a nutrient and a context condition
-- (not to a single result's severity) -- e.g. "zinc + prolonged high dose
-- -> copper deficiency risk" applies regardless of today's zinc value.
CREATE TABLE IF NOT EXISTS lab_safety_flags (
  id SERIAL PRIMARY KEY,
  nutrient_key TEXT REFERENCES nutrients(key),
  lab_test_key TEXT REFERENCES lab_test_types(key),
  condition_type TEXT NOT NULL, -- RENAL_IMPAIRMENT | INFLAMMATION | PREGNANCY | PROLONGED_HIGH_DOSE | ANTICOAGULANT_USE | GENERAL
  warning_text TEXT NOT NULL,
  active BOOLEAN DEFAULT true
);

-- Extend the existing per-test result row with the richer clinical fields.
-- lab_result_markers already IS "one test result" (lab_results is the
-- batch/photo/manual-entry session it came from) -- this is the natural
-- home for LabResult rather than a new parallel table.
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS reference_min NUMERIC;
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS reference_max NUMERIC;
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS reference_range_text TEXT;
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS reference_source TEXT;
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS reference_range_type TEXT; -- LAB_PROVIDED | STANDARD_REFERENCE | CLINICAL_INTERPRETATION | NOT_ESTABLISHED
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS lab_status TEXT; -- NORMAL_BY_LAB | LOW | HIGH | null (no lab range given)
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS nutritional_status TEXT; -- the rule-engine severity
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS interpretation_message TEXT;
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS clinical_review_required BOOLEAN DEFAULT false;
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS fasting_status TEXT;
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS lab_name TEXT;
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS pharmacist_notes TEXT;
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS result_text TEXT; -- for qualitative/non-numeric results
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS test_date DATE;
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS interpretation_rule_id INTEGER REFERENCES lab_interpretation_rules(id);
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS original_value NUMERIC; -- pre-conversion, only set when a unit conversion happened
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS original_unit TEXT;

-- Allow the existing follow-up dashboard to also drive lab retesting,
-- instead of building a second, parallel follow-up system.
ALTER TABLE followups ADD COLUMN IF NOT EXISTS lab_result_id INTEGER REFERENCES lab_results(id);

-- Generic audit log: who entered/edited/reviewed a lab result, and who
-- changed a clinical rule -- one shared table rather than one per entity.
CREATE TABLE IF NOT EXISTS lab_audit_log (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL, -- lab_result_marker | lab_interpretation_rule | evidence_source | lab_test_type | ...
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL, -- create | update | review
  changed_by_staff_id INTEGER REFERENCES staff(id),
  changed_at TIMESTAMP DEFAULT now(),
  previous_value JSONB,
  new_value JSONB,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_lab_interpretation_rules_test_key ON lab_interpretation_rules(lab_test_key, active);
CREATE INDEX IF NOT EXISTS idx_lab_test_nutrient_relations_test_key ON lab_test_nutrient_relations(lab_test_key);
CREATE INDEX IF NOT EXISTS idx_lab_test_relations_test_key ON lab_test_relations(lab_test_key);
CREATE INDEX IF NOT EXISTS idx_supplement_recommendation_rules_nutrient ON supplement_recommendation_rules(nutrient_key);
CREATE INDEX IF NOT EXISTS idx_lab_safety_flags_nutrient ON lab_safety_flags(nutrient_key);
CREATE INDEX IF NOT EXISTS idx_lab_result_markers_test_date ON lab_result_markers(test_date);
CREATE INDEX IF NOT EXISTS idx_lab_audit_log_entity ON lab_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_followups_lab_result_id ON followups(lab_result_id);

-- Pharmacist review metadata for individual lab result markers, needed for
-- the "Mark reviewed" dashboard action. Additive only.
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS reviewed_by_staff_id INTEGER REFERENCES staff(id);
ALTER TABLE lab_result_markers ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

-- Let a follow-up be created directly from a lab result even when there is
-- no visit yet (visit_id already nullable) -- lab_result_id was added in
-- 005_lab_clinical_module.sql; this just makes patient lookup work when
-- visit_id is null.
CREATE INDEX IF NOT EXISTS idx_lab_result_markers_reviewed ON lab_result_markers(reviewed_at);

-- A follow-up created directly from a lab result (no visit yet) needs its
-- own note field distinct from patient_comment (which holds the patient's
-- own response, not a staff-entered reason for the follow-up).
ALTER TABLE followups ADD COLUMN IF NOT EXISTS staff_note TEXT;

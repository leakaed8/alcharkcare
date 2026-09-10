-- Core patient care loop: configurable check-ins/feedback, pharmacist
-- messaging, progress-photo categorization, and notification preferences.
-- Extends existing tables (followups, progress_photos, patients) rather
-- than duplicating them; only genuinely new concepts get new tables.

-- Follow-ups gain a reason and an assigned pharmacist, per spec section 7.
ALTER TABLE followups ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE followups ADD COLUMN IF NOT EXISTS assigned_staff_id INTEGER REFERENCES staff(id);

-- Progress photos gain a category (acne/pigmentation/redness/texture/hair/
-- skin/other) -- consent_given and body_area already existed.
ALTER TABLE progress_photos ADD COLUMN IF NOT EXISTS category TEXT; -- acne | pigmentation | redness | texture | hair | skin | other

-- Per-patient notification preferences: care vs. promotional are kept
-- separate (spec section 28), plus quiet hours. A single JSONB column
-- rather than five new scalar columns since these are all read/written
-- together and only by the patient's own settings screen.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"care_enabled": true, "promo_enabled": false, "quiet_hours_start": "21:00", "quiet_hours_end": "08:00"}';

-- Small global key/value settings table for things like the max check-ins
-- per week -- admin-configurable, one row per key, reused wherever a
-- system-wide default is needed instead of a hardcoded constant.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT now(),
  updated_by_staff_id INTEGER REFERENCES staff(id)
);

INSERT INTO app_settings (key, value) VALUES
  ('checkin_frequency', '{"max_per_week": 2}')
ON CONFLICT (key) DO NOTHING;

-- Staff-configured check-in questions. Targeted by day-offset since a
-- routine item was started, and optionally scoped to one product or a
-- whole category, per spec section 5.
CREATE TABLE IF NOT EXISTS checkin_questions (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  day_offset INTEGER NOT NULL, -- days since the routine item's started_date
  target_scope TEXT NOT NULL DEFAULT 'all', -- all | product | category
  target_product_id INTEGER REFERENCES products(id),
  target_category TEXT,
  response_type TEXT NOT NULL DEFAULT 'mood', -- mood | yes_no | scale | text
  options JSONB, -- [{ "label": "Good", "value": "good", "emoji": "😊", "is_problem": false }, ...]
  active BOOLEAN NOT NULL DEFAULT true,
  created_by_staff_id INTEGER REFERENCES staff(id),
  created_at TIMESTAMP DEFAULT now()
);

-- A patient's actual response to a (possibly ad-hoc) check-in. visit_product_id
-- links it to the specific routine item being asked about, when there is one.
CREATE TABLE IF NOT EXISTS checkins (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  question_id INTEGER REFERENCES checkin_questions(id),
  visit_product_id INTEGER REFERENCES visit_products(id),
  response_value TEXT,
  response_label TEXT,
  is_problem BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  staff_acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT now()
);

-- "Ask my pharmacist" -- a simple threaded conversation per patient, kept
-- separate from internal pharmacist notes on a visit.
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  sender TEXT NOT NULL, -- patient | staff
  sender_staff_id INTEGER REFERENCES staff(id),
  category TEXT, -- question | product_issue | routine_question | follow_up_request | general
  body TEXT NOT NULL,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkins_patient_id ON checkins(patient_id);
CREATE INDEX IF NOT EXISTS idx_checkins_is_problem ON checkins(is_problem);
CREATE INDEX IF NOT EXISTS idx_checkin_questions_active ON checkin_questions(active);
CREATE INDEX IF NOT EXISTS idx_messages_patient_id ON messages(patient_id);
CREATE INDEX IF NOT EXISTS idx_messages_read_at ON messages(read_at);
CREATE INDEX IF NOT EXISTS idx_followups_assigned_staff_id ON followups(assigned_staff_id);

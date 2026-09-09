-- Care plans: the missing middle of the purchase -> care journey. A plan
-- groups several visits (and the products/instructions logged in them)
-- under one ongoing goal, instead of every visit being a disconnected
-- one-off record.

CREATE TABLE IF NOT EXISTS care_plans (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  title TEXT NOT NULL,
  goal TEXT,
  status TEXT DEFAULT 'active', -- active | completed | paused | cancelled
  start_date DATE DEFAULT CURRENT_DATE,
  target_end_date DATE,
  created_by_staff_id INTEGER REFERENCES staff(id),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

ALTER TABLE visits ADD COLUMN IF NOT EXISTS care_plan_id INTEGER REFERENCES care_plans(id);

CREATE INDEX IF NOT EXISTS idx_care_plans_patient_id ON care_plans(patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_care_plan_id ON visits(care_plan_id);

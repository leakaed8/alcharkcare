-- Moves the lab marker list (Vitamin D, B12, etc.) from a hardcoded array
-- in code into the database, so staff can add new test types from the app
-- instead of needing a code change. Also used to populate the dropdown for
-- manually-entered lab results (OCR doesn't always read correctly).

CREATE TABLE IF NOT EXISTS lab_test_types (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  unit TEXT NOT NULL,
  ref_low NUMERIC,
  ref_high NUMERIC,
  aliases TEXT[], -- lowercase phrases OCR text is matched against
  created_at TIMESTAMP DEFAULT now()
);

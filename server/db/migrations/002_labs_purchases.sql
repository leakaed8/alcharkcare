-- Lab result scanning, product-name-only purchase history, and the
-- nutrient content products supply (used to cross-check lab markers).
-- No image bytes are ever stored here -- only OCR'd text/extracted names.

CREATE TABLE IF NOT EXISTS product_nutrients (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  nutrient_key TEXT NOT NULL,
  amount NUMERIC,
  unit TEXT
);

CREATE TABLE IF NOT EXISTS lab_results (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  scanned_by_staff_id INTEGER REFERENCES staff(id),
  raw_text TEXT,
  scanned_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_result_markers (
  id SERIAL PRIMARY KEY,
  lab_result_id INTEGER REFERENCES lab_results(id) ON DELETE CASCADE,
  nutrient_key TEXT NOT NULL,
  value NUMERIC,
  unit TEXT,
  flag TEXT -- low | normal | high
);

CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  product_id INTEGER REFERENCES products(id),
  product_name TEXT NOT NULL,
  purchased_at TIMESTAMP DEFAULT now(),
  logged_by_staff_id INTEGER REFERENCES staff(id)
);

CREATE INDEX IF NOT EXISTS idx_lab_results_patient_id ON lab_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_purchases_patient_id ON purchases(patient_id);
CREATE INDEX IF NOT EXISTS idx_product_nutrients_product_id ON product_nutrients(product_id);

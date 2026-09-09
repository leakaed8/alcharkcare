-- Al Chark Patient CRM — full schema.
-- Steps 1-4 of the build order use: staff, patients, products, visits,
-- visit_products, followups. The remaining tables are created now so later
-- steps (photos, offers, shop) don't require a schema migration.

CREATE TABLE IF NOT EXISTS staff (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'staff', -- staff | admin
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  pin_hash TEXT NOT NULL,
  dob DATE,
  family_group_id INTEGER REFERENCES patients(id),
  skin_type TEXT,
  hair_type TEXT,
  allergies TEXT[],
  conditions TEXT[],
  pregnancy_flag BOOLEAN DEFAULT false,
  purchase_total_lifetime NUMERIC DEFAULT 0,
  purchase_total_rolling_12mo NUMERIC DEFAULT 0,
  loyalty_tier TEXT DEFAULT 'bronze',
  push_subscription JSONB,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  sku TEXT UNIQUE,
  price NUMERIC,
  stock_qty INTEGER DEFAULT 0,
  duration_days INTEGER,
  image_url TEXT,
  description TEXT
);

-- Groups several visits under one ongoing goal, instead of every visit
-- being a disconnected one-off record.
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

CREATE TABLE IF NOT EXISTS visits (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  staff_id INTEGER REFERENCES staff(id),
  care_plan_id INTEGER REFERENCES care_plans(id),
  visit_date TIMESTAMP DEFAULT now(),
  complaint TEXT,
  assessment TEXT,
  lifestyle_advice TEXT,
  photo_urls TEXT[],
  next_followup_date DATE
);

CREATE TABLE IF NOT EXISTS visit_products (
  id SERIAL PRIMARY KEY,
  visit_id INTEGER REFERENCES visits(id),
  product_id INTEGER REFERENCES products(id),
  is_supplement BOOLEAN DEFAULT false,
  dosing_notes TEXT
);

CREATE TABLE IF NOT EXISTS followups (
  id SERIAL PRIMARY KEY,
  visit_id INTEGER REFERENCES visits(id),
  scheduled_date DATE,
  sent_date TIMESTAMP,
  response TEXT, -- better | same | worse | no_response
  patient_comment TEXT,
  status TEXT DEFAULT 'pending', -- pending | closed | escalated
  logged_by_staff_id INTEGER REFERENCES staff(id)
);

CREATE TABLE IF NOT EXISTS staff_notes (
  id SERIAL PRIMARY KEY,
  visit_id INTEGER REFERENCES visits(id),
  note_text TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS progress_photos (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  visit_id INTEGER REFERENCES visits(id),
  photo_url TEXT NOT NULL,
  body_area TEXT,
  taken_date DATE DEFAULT CURRENT_DATE,
  uploaded_by TEXT, -- 'patient' | 'staff'
  consent_given BOOLEAN DEFAULT true,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS offers (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  type TEXT, -- tier | birthday | referral
  code TEXT UNIQUE,
  issued_date DATE DEFAULT CURRENT_DATE,
  expiry_date DATE,
  redeemed BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  order_date TIMESTAMP DEFAULT now(),
  status TEXT DEFAULT 'pending', -- pending | confirmed | fulfilled | cancelled
  payment_method TEXT, -- cash_on_pickup | bank_transfer | other
  total NUMERIC
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER,
  unit_price NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_visits_patient_id ON visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_followups_scheduled_date ON followups(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_followups_status ON followups(status);
CREATE INDEX IF NOT EXISTS idx_visit_products_visit_id ON visit_products(visit_id);

-- Lab scanning, product-name-only purchase history, and nutrient content
-- (see migrations/002_labs_purchases.sql). No image bytes are ever stored
-- -- only OCR'd text/extracted names.

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
CREATE INDEX IF NOT EXISTS idx_care_plans_patient_id ON care_plans(patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_care_plan_id ON visits(care_plan_id);

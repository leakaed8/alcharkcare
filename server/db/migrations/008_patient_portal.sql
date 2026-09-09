-- Patient portal redesign: patient-visible visit summaries, per-product
-- recommendation status, and "ask about a product" requests. Extends
-- existing tables (visits, visit_products, products) rather than
-- duplicating them; product_requests is a genuinely new concept.

-- Separate from the internal `assessment`/`lifestyle_advice` fields, which
-- stay staff-only. If a visit has no patient_summary, the portal shows a
-- generic placeholder instead of ever falling back to internal text.
ALTER TABLE visits ADD COLUMN IF NOT EXISTS patient_summary TEXT;

-- Turns "this product was part of this visit" into a trackable
-- recommendation lifecycle, without a parallel ProductRecommendation table.
ALTER TABLE visit_products ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'recommended'; -- recommended | started | completed | cancelled
ALTER TABLE visit_products ADD COLUMN IF NOT EXISTS reason TEXT; -- why the pharmacist recommended it, patient-visible
ALTER TABLE visit_products ADD COLUMN IF NOT EXISTS started_date DATE;
ALTER TABLE visit_products ADD COLUMN IF NOT EXISTS patient_visible BOOLEAN NOT NULL DEFAULT true;

-- Nullable, populated by staff over time via the product catalog -- never
-- fabricated. Used by patient-facing search/display.
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;

-- For the patient profile page's "preferred communication method".
ALTER TABLE patients ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT; -- phone | whatsapp | sms | email

-- A patient-submitted request for a product not found (or not available)
-- in the catalog.
CREATE TABLE IF NOT EXISTS product_requests (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  requested_text TEXT NOT NULL,
  matched_product_id INTEGER REFERENCES products(id),
  status TEXT NOT NULL DEFAULT 'requested', -- requested | reviewing | ordered | available | not_available | fulfilled | cancelled
  notes TEXT,
  location TEXT,
  source TEXT NOT NULL DEFAULT 'patient_portal',
  requested_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_requests_patient_id ON product_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_product_requests_status ON product_requests(status);
CREATE INDEX IF NOT EXISTS idx_visit_products_status ON visit_products(status);

-- Google Sheets sync (validation/import layer feeding the app database --
-- the sheet never becomes the system of record) + the product approval
-- workflow that gates anything it imports before it can go live.

ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS benefits TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ingredients TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS directions_for_use TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS frequency TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost NUMERIC; -- wholesale cost, distinct from the patient-facing `price`
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS recommendation_eligible BOOLEAN NOT NULL DEFAULT true;

-- Existing products were already live before this workflow existed, so they
-- default straight to 'published' -- nothing currently visible in the shop
-- disappears. Only products the sync creates start at 'draft'.
ALTER TABLE products ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'published';
-- draft | review_required | approved | published

-- Sync bookkeeping, per product. sheet_row_hash lets a re-sync skip a row
-- that hasn't changed since it was last read; last_synced_at is the
-- baseline a future sync compares `updated_at` against to tell whether
-- staff edited this product in-app since -- NULL means "never synced",
-- so the very first sync always applies the sheet's values rather than
-- manufacturing conflicts against a baseline that never existed.
ALTER TABLE products ADD COLUMN IF NOT EXISTS sheet_row_hash TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS external_sheet_row INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_products_approval_status ON products(approval_status);

CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,
  sync_type TEXT NOT NULL DEFAULT 'manual', -- manual | auto
  status TEXT NOT NULL DEFAULT 'running', -- running | success | partial | failed
  started_at TIMESTAMP NOT NULL DEFAULT now(),
  finished_at TIMESTAMP,
  rows_created INTEGER NOT NULL DEFAULT 0,
  rows_updated INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  rows_conflicted INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]',
  warnings JSONB NOT NULL DEFAULT '[]',
  triggered_by_staff_id INTEGER REFERENCES staff(id)
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at ON sync_logs(started_at DESC);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id SERIAL PRIMARY KEY,
  sync_log_id INTEGER REFERENCES sync_logs(id),
  product_id INTEGER REFERENCES products(id),
  field_name TEXT NOT NULL,
  app_value TEXT,
  sheet_value TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | kept_app | used_sheet
  resolved_by_staff_id INTEGER REFERENCES staff(id),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status ON sync_conflicts(status);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_product_id ON sync_conflicts(product_id);

INSERT INTO app_settings (key, value) VALUES
  ('google_sheets_sync', '{"sheet_id": null, "products_tab": "PRODUCTS", "auto_sync_enabled": false, "auto_sync_interval_hours": 24}')
ON CONFLICT (key) DO NOTHING;

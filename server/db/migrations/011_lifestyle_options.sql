-- A configurable list of lifestyle-modification suggestions staff can pick
-- from on the New Visit form (checkboxes + an "Other" free-text field),
-- instead of typing the same common advice ("reduce spicy food", "increase
-- water intake"...) from scratch every time. Maintained either manually
-- here or via the Google Sheets sync's LIFESTYLE tab.
CREATE TABLE IF NOT EXISTS lifestyle_options (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual', -- manual | sheet
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lifestyle_options_active ON lifestyle_options(active);

UPDATE app_settings
SET value = value || '{"lifestyle_tab": "LIFESTYLE"}'::jsonb
WHERE key = 'google_sheets_sync';

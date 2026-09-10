-- Replaces the old scheduled mood check-in system with product-driven
-- notifications: a per-recommendation duration/refill setting, a
-- per-product daily reminder message, and a refill decision log. The old
-- checkin_questions/checkins tables are left in place (real patient
-- history, never dropped) but are no longer written to except as a plain
-- ad-hoc activity log (Mark done / Report difficulty).

ALTER TABLE visit_products ADD COLUMN IF NOT EXISTS duration_days INTEGER; -- per-patient override; falls back to products.duration_days
ALTER TABLE visit_products ADD COLUMN IF NOT EXISTS refill_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE products ADD COLUMN IF NOT EXISTS reminder_frequency TEXT NOT NULL DEFAULT 'none'; -- none | daily
ALTER TABLE products ADD COLUMN IF NOT EXISTS daily_reminder_message TEXT; -- e.g. "Don't forget your sunscreen today"

CREATE TABLE IF NOT EXISTS refill_checks (
  id SERIAL PRIMARY KEY,
  visit_product_id INTEGER NOT NULL REFERENCES visit_products(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  prompted_at TIMESTAMP NOT NULL DEFAULT now(),
  response TEXT NOT NULL DEFAULT 'pending', -- pending | yes | snoozed | no
  snooze_until DATE,
  no_reason TEXT, -- product_problem | too_expensive | switching_product | other
  no_reason_note TEXT,
  responded_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refill_checks_patient_id ON refill_checks(patient_id);
CREATE INDEX IF NOT EXISTS idx_refill_checks_response ON refill_checks(response);
CREATE INDEX IF NOT EXISTS idx_refill_checks_visit_product_id ON refill_checks(visit_product_id);

-- Linked Telegram chat for staff notifications, set via the in-app
-- "Connect Telegram" flow instead of a manually-configured env var. The
-- bot's own token stays in TELEGRAM_BOT_TOKEN (server-only, never in the
-- database) -- this only stores which chat it should send to.
INSERT INTO app_settings (key, value) VALUES ('telegram', '{"chat_id": null}')
ON CONFLICT (key) DO NOTHING;

-- Tracks the last date each daily background job ran, so a periodic check
-- (see index.js) can fire at most once per day instead of once per
-- interval tick.
INSERT INTO app_settings (key, value) VALUES ('scheduler', '{"last_followup_notify_date": null, "last_daily_reminder_run_date": null}')
ON CONFLICT (key) DO NOTHING;

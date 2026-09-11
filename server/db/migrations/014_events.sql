-- Pharmacy-hosted events (health workshops, screenings, in-store promotions)
-- that patients can browse and RSVP to. Capacity is optional -- null means
-- unlimited -- and is enforced against the count of 'going' RSVPs, never
-- guessed at.

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location TEXT,
  capacity INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_staff_id INTEGER REFERENCES staff(id),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_is_active ON events(is_active);

CREATE TABLE IF NOT EXISTS event_rsvps (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  status TEXT NOT NULL DEFAULT 'going', -- going | cancelled
  reminded_at TIMESTAMP, -- set once the day-before reminder push has been sent, so it's never re-sent
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (event_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_event_id ON event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_patient_id ON event_rsvps(patient_id);

INSERT INTO app_settings (key, value)
VALUES ('scheduler', '{"last_followup_notify_date": null, "last_daily_reminder_run_date": null, "last_event_reminder_run_date": null}')
ON CONFLICT (key) DO UPDATE SET value = app_settings.value || '{"last_event_reminder_run_date": null}'::jsonb
WHERE NOT (app_settings.value ? 'last_event_reminder_run_date');

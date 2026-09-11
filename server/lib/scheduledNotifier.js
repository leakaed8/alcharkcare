const pool = require('../db/pool');
const { notifyStaff } = require('./staffNotify');
const { sendPush, isConfigured: pushConfigured } = require('./pushNotify');
const { todayInBeirut } = require('./beirutDate');

async function getSchedulerState() {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'scheduler'");
  return rows[0]?.value || {};
}

async function setSchedulerState(patch) {
  await pool.query(
    `UPDATE app_settings SET value = value || $1::jsonb, updated_at = now() WHERE key = 'scheduler'`,
    [JSON.stringify(patch)]
  );
}

async function pushToPatient(patient, payload) {
  if (!pushConfigured() || !patient.push_subscription) return;
  const result = await sendPush(patient.push_subscription, payload);
  if (!result.ok && (result.statusCode === 410 || result.statusCode === 404)) {
    await pool.query('UPDATE patients SET push_subscription = NULL WHERE id = $1', [patient.id]);
  }
}

// Consolidates today's due/overdue follow-ups into one staff notification
// (never one push per follow-up) -- staff opted to be told proactively
// instead of having to remember to check the Follow-ups dashboard.
async function maybeNotifyDueFollowups() {
  const today = todayInBeirut();
  const state = await getSchedulerState();
  if (state.last_followup_notify_date === today) return;

  const { rows } = await pool.query(
    `SELECT f.id, p.name AS patient_name,
            CASE WHEN f.scheduled_date < CURRENT_DATE THEN 'overdue' ELSE 'due_today' END AS bucket
     FROM followups f
     LEFT JOIN visits v ON v.id = f.visit_id
     LEFT JOIN lab_results lr ON lr.id = f.lab_result_id
     JOIN patients p ON p.id = COALESCE(v.patient_id, lr.patient_id)
     WHERE f.status = 'pending' AND f.scheduled_date <= CURRENT_DATE
     ORDER BY f.scheduled_date ASC`
  );

  await setSchedulerState({ last_followup_notify_date: today });
  if (rows.length === 0) return;

  const overdueNames = rows.filter((r) => r.bucket === 'overdue').map((r) => r.patient_name);
  const dueTodayNames = rows.filter((r) => r.bucket === 'due_today').map((r) => r.patient_name);
  const parts = [];
  if (overdueNames.length > 0) parts.push(`Overdue: ${overdueNames.join(', ')}`);
  if (dueTodayNames.length > 0) parts.push(`Due today: ${dueTodayNames.join(', ')}`);

  await notifyStaff(`Follow-ups need attention -- ${parts.join(' · ')}`, { title: 'Follow-ups due', url: '/staff/followups' })
    .catch((err) => console.error('Follow-up notify error:', err.message));
}

// Two product-driven jobs for patients, run together once a day: a daily
// reminder message for anything configured with reminder_frequency =
// 'daily', and creating (+ pushing) a refill prompt for anything whose
// estimated supply has run out, per visit_product -- never both for the
// same visit_product on the same day, and never a second refill prompt
// while one is still pending or snoozed.
async function maybeSendDailyReminders() {
  const today = todayInBeirut();
  const state = await getSchedulerState();
  if (state.last_daily_reminder_run_date === today) return;
  await setSchedulerState({ last_daily_reminder_run_date: today });

  const { rows: reminders } = await pool.query(
    `SELECT v.patient_id, p.name AS product_name, p.daily_reminder_message, pt.push_subscription, pt.id AS patient_row_id
     FROM visit_products vp
     JOIN visits v ON v.id = vp.visit_id
     JOIN products p ON p.id = vp.product_id
     JOIN patients pt ON pt.id = v.patient_id
     WHERE vp.status = 'started' AND p.reminder_frequency = 'daily' AND p.daily_reminder_message IS NOT NULL`
  );
  for (const r of reminders) {
    await pushToPatient({ id: r.patient_row_id, push_subscription: r.push_subscription }, {
      title: 'Al Chark', body: r.daily_reminder_message, url: '/patient',
    }).catch((err) => console.error('Daily reminder push error:', err.message));
  }

  const { rows: dueRefills } = await pool.query(
    `SELECT vp.id AS visit_product_id, v.patient_id, vp.product_id, p.name AS product_name,
            pt.push_subscription, pt.id AS patient_row_id
     FROM visit_products vp
     JOIN visits v ON v.id = vp.visit_id
     JOIN products p ON p.id = vp.product_id
     JOIN patients pt ON pt.id = v.patient_id
     WHERE vp.status = 'started' AND vp.refill_enabled = true AND vp.started_date IS NOT NULL
       AND COALESCE(vp.duration_days, p.duration_days) IS NOT NULL
       AND (vp.started_date + (COALESCE(vp.duration_days, p.duration_days) || ' days')::interval)::date <= CURRENT_DATE
       AND NOT EXISTS (SELECT 1 FROM refill_checks rc WHERE rc.visit_product_id = vp.id AND rc.response = 'pending')
       AND NOT EXISTS (SELECT 1 FROM refill_checks rc WHERE rc.visit_product_id = vp.id AND rc.response = 'snoozed' AND rc.snooze_until > CURRENT_DATE)`
  );
  for (const r of dueRefills) {
    await pool.query(
      `INSERT INTO refill_checks (visit_product_id, patient_id, product_id, response) VALUES ($1, $2, $3, 'pending')`,
      [r.visit_product_id, r.patient_id, r.product_id]
    );
    await pushToPatient({ id: r.patient_row_id, push_subscription: r.push_subscription }, {
      title: 'Al Chark', body: `Running low on ${r.product_name}? Let us know if you need a refill.`, url: '/patient',
    }).catch((err) => console.error('Refill prompt push error:', err.message));
  }
}

// Day-before reminder for patients "going" to an event happening tomorrow.
// reminded_at guards against a duplicate send if this ever runs more than
// once for the same RSVP (the daily gate above already limits it to once
// per Beirut day, but this is the record that survives across days).
async function maybeSendEventReminders() {
  const today = todayInBeirut();
  const state = await getSchedulerState();
  if (state.last_event_reminder_run_date === today) return;
  await setSchedulerState({ last_event_reminder_run_date: today });

  const { rows } = await pool.query(
    `SELECT r.id AS rsvp_id, e.title, e.event_date::text AS event_date, e.location,
            pt.push_subscription, pt.id AS patient_row_id
     FROM event_rsvps r
     JOIN events e ON e.id = r.event_id
     JOIN patients pt ON pt.id = r.patient_id
     WHERE r.status = 'going' AND r.reminded_at IS NULL AND e.is_active = true
       AND e.event_date = CURRENT_DATE + INTERVAL '1 day'`
  );

  for (const r of rows) {
    await pushToPatient({ id: r.patient_row_id, push_subscription: r.push_subscription }, {
      title: 'Al Chark', body: `Reminder: "${r.title}" is tomorrow${r.location ? ` at ${r.location}` : ''}.`, url: '/patient/events',
    }).catch((err) => console.error('Event reminder push error:', err.message));
    await pool.query('UPDATE event_rsvps SET reminded_at = now() WHERE id = $1', [r.rsvp_id]);
  }
}

module.exports = { maybeNotifyDueFollowups, maybeSendDailyReminders, maybeSendEventReminders };

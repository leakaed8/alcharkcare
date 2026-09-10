const pool = require('../db/pool');
const { sendPush, isConfigured: pushConfigured } = require('./pushNotify');
const { sendTelegramMessage, isConfigured: telegramConfigured } = require('./telegramNotify');

// The one shared notification service for staff-facing alerts (new order,
// patient-reported problem, new message, ...) -- every feature that needs
// to notify staff calls this instead of re-implementing the push/Telegram
// fan-out. Best-effort: a delivery failure here must never fail the
// action that triggered it, so every step is caught individually.
async function notifyStaff(text, { url = '/staff', title = 'Al Chark' } = {}) {
  if (telegramConfigured()) {
    await sendTelegramMessage(text).catch((err) => console.error('Telegram notify error:', err.message));
  }

  if (pushConfigured()) {
    try {
      const { rows } = await pool.query('SELECT id, push_subscription FROM staff WHERE push_subscription IS NOT NULL');
      for (const staff of rows) {
        const result = await sendPush(staff.push_subscription, { title, body: text, url });
        // A gone/expired subscription (410/404) will never succeed again -- clear it.
        if (!result.ok && (result.statusCode === 410 || result.statusCode === 404)) {
          await pool.query('UPDATE staff SET push_subscription = NULL WHERE id = $1', [staff.id]);
        }
      }
    } catch (err) {
      console.error('Push notify error:', err.message);
    }
  }
}

module.exports = { notifyStaff };

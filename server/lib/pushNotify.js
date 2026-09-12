const webpush = require('web-push');
const pool = require('../db/pool');

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:staff@alcharkcare.example',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  configured = true;
  return true;
}

function isConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

// Sends a browser push notification to one stored subscription. Never
// throws on delivery failure (an expired/revoked subscription shouldn't
// break the caller's request) -- it just logs and moves on. Callers that
// want to prune dead subscriptions can check the returned `ok` flag.
async function sendPush(subscription, payload) {
  if (!ensureConfigured() || !subscription) return { ok: false, reason: 'not_configured_or_no_subscription' };
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    console.error('Push notification failed:', err.message);
    return { ok: false, reason: err.message, statusCode: err.statusCode };
  }
}

// Shared helper for any route that needs to push a single patient a
// status-change notification (orders, product requests, message replies,
// the manager test-push button) without each caller re-fetching the
// subscription or duplicating the expired-subscription cleanup.
// Never throws -- same contract as sendPush -- so callers can safely
// fire-and-forget with .catch(console.error).
async function pushToPatientById(patientId, payload) {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };
  const { rows } = await pool.query('SELECT push_subscription FROM patients WHERE id = $1', [patientId]);
  const subscription = rows[0]?.push_subscription;
  if (!subscription) return { ok: false, reason: 'no_subscription' };

  const result = await sendPush(subscription, payload);
  if (!result.ok && (result.statusCode === 410 || result.statusCode === 404)) {
    await pool.query('UPDATE patients SET push_subscription = NULL WHERE id = $1', [patientId]);
  }
  return result;
}

module.exports = { isConfigured, sendPush, pushToPatientById };

const webpush = require('web-push');

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

module.exports = { isConfigured, sendPush };

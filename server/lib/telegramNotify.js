// Talks to the Telegram Bot HTTP API directly (a single JSON POST) --
// deliberately no SDK dependency for one endpoint. No-ops quietly when the
// bot token/chat id aren't configured, so this feature works today via the
// in-app queue and push, and Telegram can be turned on later just by
// setting the two env vars, with no code change.
function isConfigured() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_STAFF_CHAT_ID);
}

async function sendTelegramMessage(text) {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_STAFF_CHAT_ID, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('Telegram notification failed:', res.status, body);
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('Telegram notification failed:', err.message);
    return { ok: false, reason: err.message };
  }
}

module.exports = { isConfigured, sendTelegramMessage };

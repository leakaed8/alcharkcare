const pool = require('../db/pool');

// Talks to the Telegram Bot HTTP API directly -- deliberately no SDK
// dependency for a handful of endpoints. The bot's own credential
// (TELEGRAM_BOT_TOKEN) stays a server-only env var, same as every other
// secret in this app; which chat it sends to is no longer a second env var
// staff have to be handed -- it's set from inside the app via the
// "Connect Telegram" flow (see routes/telegram.js) and stored in
// app_settings, so linking/relinking never needs a redeploy.

// Pending link codes are short-lived (a few minutes, while an admin is
// actively clicking through Telegram) and only matter for this running
// process, so an in-memory map is enough -- no need for a DB table just to
// survive a restart mid-link; worst case, the admin regenerates a code.
const pendingCodes = new Map(); // code -> createdAt
const CODE_TTL_MS = 10 * 60 * 1000;

function hasBotToken() {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

async function getLinkedChatId() {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'telegram'");
  return rows[0]?.value?.chat_id || null;
}

async function setLinkedChatId(chatId) {
  await pool.query(
    `UPDATE app_settings SET value = jsonb_set(value, '{chat_id}', to_jsonb($1::text)), updated_at = now() WHERE key = 'telegram'`,
    [String(chatId)]
  );
}

async function isConfigured() {
  return hasBotToken() && !!(await getLinkedChatId());
}

async function callTelegramApi(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram API ${method} failed: HTTP ${res.status}`);
  }
  return data.result;
}

async function sendTelegramMessage(text) {
  if (!hasBotToken()) return { ok: false, reason: 'not_configured' };
  const chatId = await getLinkedChatId();
  if (!chatId) return { ok: false, reason: 'not_linked' };
  try {
    await callTelegramApi('sendMessage', { chat_id: chatId, text });
    return { ok: true };
  } catch (err) {
    console.error('Telegram notification failed:', err.message);
    return { ok: false, reason: err.message };
  }
}

// Fetches the bot's own @username (needed to build a t.me deep link) --
// cheap to call each time rather than caching, since it's only used when
// an admin opens the "Connect Telegram" screen, not on any hot path.
async function getBotUsername() {
  if (!hasBotToken()) return null;
  const me = await callTelegramApi('getMe', {});
  return me.username;
}

function generateLinkCode() {
  for (const [code, createdAt] of pendingCodes) {
    if (Date.now() - createdAt > CODE_TTL_MS) pendingCodes.delete(code);
  }
  const code = Math.random().toString(36).slice(2, 10);
  pendingCodes.set(code, Date.now());
  return code;
}

// Called by the webhook route for every incoming Telegram update. Only
// acts on a "/start <code>" message matching a code this process just
// generated -- anything else is ignored.
async function handleWebhookUpdate(update) {
  const message = update?.message;
  const text = message?.text || '';
  const match = text.match(/^\/start\s+(\S+)/);
  if (!match) return;

  const code = match[1];
  const createdAt = pendingCodes.get(code);
  if (!createdAt || Date.now() - createdAt > CODE_TTL_MS) return;

  pendingCodes.delete(code);
  await setLinkedChatId(message.chat.id);
  await callTelegramApi('sendMessage', {
    chat_id: message.chat.id,
    text: '✅ Connected! Al Chark will send staff notifications to this chat from now on.',
  }).catch((err) => console.error('Telegram confirm message failed:', err.message));
}

async function registerWebhook() {
  if (!hasBotToken()) return;
  const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_BASE_URL;
  if (!baseUrl) return; // no public URL known (e.g. local dev) -- nothing to register against
  try {
    await callTelegramApi('setWebhook', { url: `${baseUrl}/api/telegram/webhook` });
  } catch (err) {
    console.error('Telegram webhook registration failed:', err.message);
  }
}

module.exports = {
  hasBotToken,
  isConfigured,
  getLinkedChatId,
  sendTelegramMessage,
  getBotUsername,
  generateLinkCode,
  handleWebhookUpdate,
  registerWebhook,
};

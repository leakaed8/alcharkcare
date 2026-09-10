const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const {
  hasBotToken, getLinkedChatId, getBotUsername, generateLinkCode, handleWebhookUpdate,
} = require('../lib/telegramNotify');
const pool = require('../db/pool');

const router = express.Router();

// Connection status for the "Connect Telegram" screen. Admin only.
router.get('/status', verifyToken, requireRole('admin'), asyncHandler(async (req, res) => {
  const botConfigured = hasBotToken();
  const chatId = botConfigured ? await getLinkedChatId() : null;
  res.json({ bot_configured: botConfigured, linked: !!chatId });
}));

// Generates a one-time code and the Telegram deep link an admin opens to
// confirm the connection. The frontend polls /status afterward to see when
// the webhook has recorded a chat_id.
router.post('/connect', verifyToken, requireRole('admin'), asyncHandler(async (req, res) => {
  if (!hasBotToken()) {
    return res.status(503).json({ error: 'Set TELEGRAM_BOT_TOKEN on the server before connecting.' });
  }
  const username = await getBotUsername().catch((err) => {
    throw new Error(`Could not reach Telegram: ${err.message}`);
  });
  const code = generateLinkCode();
  res.json({ deep_link: `https://t.me/${username}?start=${code}` });
}));

router.post('/disconnect', verifyToken, requireRole('admin'), asyncHandler(async (req, res) => {
  await pool.query(`UPDATE app_settings SET value = jsonb_set(value, '{chat_id}', 'null') WHERE key = 'telegram'`);
  res.status(204).end();
}));

// Telegram calls this directly -- no user session, so no verifyToken.
// Nothing here is trusted as staff/patient input; handleWebhookUpdate only
// acts on a /start message carrying a code this server itself generated.
router.post('/webhook', asyncHandler(async (req, res) => {
  await handleWebhookUpdate(req.body).catch((err) => console.error('Telegram webhook error:', err.message));
  res.status(200).end();
}));

module.exports = router;

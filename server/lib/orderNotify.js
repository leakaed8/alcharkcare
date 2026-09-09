const pool = require('../db/pool');
const { sendPush, isConfigured: pushConfigured } = require('./pushNotify');
const { sendTelegramMessage, isConfigured: telegramConfigured } = require('./telegramNotify');

// Fans a new order out to every channel that's actually configured. The
// in-app pending-orders queue needs nothing here -- it's just the orders
// table, always current. Push/Telegram are best-effort: a failure here
// must never fail the order itself, so every step is caught individually.
async function notifyStaffOfNewOrder(order, patientName) {
  const text = `New order #${order.id} from ${patientName} -- ${order.item_count} item(s). Review in the Orders queue.`;

  if (telegramConfigured()) {
    await sendTelegramMessage(text).catch((err) => console.error('Telegram notify error:', err.message));
  }

  if (pushConfigured()) {
    try {
      const { rows } = await pool.query('SELECT id, push_subscription FROM staff WHERE push_subscription IS NOT NULL');
      for (const staff of rows) {
        const result = await sendPush(staff.push_subscription, {
          title: 'New order',
          body: text,
          url: '/staff/orders',
        });
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

module.exports = { notifyStaffOfNewOrder };

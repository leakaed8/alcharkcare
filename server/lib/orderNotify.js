const { notifyStaff } = require('./staffNotify');

// Thin, feature-specific wrapper around the shared staff notification
// service -- keeps the message text next to the feature that produces it,
// without duplicating the push/Telegram fan-out logic itself.
async function notifyStaffOfNewOrder(order, patientName) {
  const text = `New order #${order.id} from ${patientName} -- ${order.item_count} item(s). Review in the Orders queue.`;
  await notifyStaff(text, { title: 'New order', url: '/staff/orders' });
}

module.exports = { notifyStaffOfNewOrder };

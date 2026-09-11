require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const visitRoutes = require('./routes/visits');
const followupRoutes = require('./routes/followups');
const productRoutes = require('./routes/products');
const labRoutes = require('./routes/labs');
const purchaseRoutes = require('./routes/purchases');
const managerRoutes = require('./routes/manager');
const carePlanRoutes = require('./routes/carePlans');
const photoRoutes = require('./routes/photos');
const labTestTypeRoutes = require('./routes/labTestTypes');
const orderRoutes = require('./routes/orders');
const productRequestRoutes = require('./routes/productRequests');
const checkinRoutes = require('./routes/checkins');
const messageRoutes = require('./routes/messages');
const sheetsSyncRoutes = require('./routes/sheetsSync');
const lifestyleOptionRoutes = require('./routes/lifestyleOptions');
const telegramRoutes = require('./routes/telegram');
const refillRoutes = require('./routes/refillChecks');
const batchRoutes = require('./routes/batches');
const expirationDiscountRuleRoutes = require('./routes/expirationDiscountRules');
const promotionRoutes = require('./routes/promotions');
const eventRoutes = require('./routes/events');
const { maybeRunAutoSync } = require('./lib/sheetsSyncRunner');
const { registerWebhook } = require('./lib/telegramNotify');
const { maybeNotifyDueFollowups, maybeSendDailyReminders, maybeSendEventReminders } = require('./lib/scheduledNotifier');

// Last-resort net: a third-party lib (e.g. the OCR worker) throwing outside
// any promise chain would otherwise crash the whole process for every user
// over one bad request. Log and keep serving instead.
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/followups', followupRoutes);
app.use('/api/products', productRoutes);
app.use('/api/labs', labRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/care-plans', carePlanRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/lab-test-types', labTestTypeRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/product-requests', productRequestRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/sheets-sync', sheetsSyncRoutes);
app.use('/api/lifestyle-options', lifestyleOptionRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/refill-checks', refillRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/expiration-discount-rules', expirationDiscountRuleRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/events', eventRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Al Chark CRM server listening on port ${PORT}`));

registerWebhook().catch((err) => console.error('Telegram webhook registration failed:', err.message));

// Auto-sync check: cheap and self-correcting, so a plain interval (not a
// real job queue) is enough -- see maybeRunAutoSync for why.
const AUTO_SYNC_CHECK_INTERVAL_MS = 60 * 60 * 1000;
setInterval(() => {
  maybeRunAutoSync().catch((err) => console.error('Auto sync check failed:', err.message));
}, AUTO_SYNC_CHECK_INTERVAL_MS);
setTimeout(() => {
  maybeRunAutoSync().catch((err) => console.error('Auto sync check failed:', err.message));
}, 30_000);

// Daily jobs (due follow-ups, product reminders, refill prompts): each is
// internally gated to run at most once per Beirut calendar day, so a
// hourly interval tick is just "has today's run happened yet?", not a
// real cron schedule -- see scheduledNotifier.js for why that's enough.
const DAILY_JOB_CHECK_INTERVAL_MS = 60 * 60 * 1000;
function runDailyJobs() {
  maybeNotifyDueFollowups().catch((err) => console.error('Follow-up notify check failed:', err.message));
  maybeSendDailyReminders().catch((err) => console.error('Daily reminder check failed:', err.message));
  maybeSendEventReminders().catch((err) => console.error('Event reminder check failed:', err.message));
}
setInterval(runDailyJobs, DAILY_JOB_CHECK_INTERVAL_MS);
setTimeout(runDailyJobs, 45_000);

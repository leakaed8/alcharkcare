const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { isConfigured: pushConfigured, sendPush, pushToPatientById } = require('../lib/pushNotify');

const router = express.Router();

// Business overview: headline counts + product/follow-up breakdowns.
// Admin (manager) only -- not linked from the regular staff nav.
router.get('/overview', verifyToken, requireRole('admin'), asyncHandler(async (req, res) => {
  const [totalPatients, newPatients, visits30d, tierBreakdown, followupOutcomes, topProducts, labScans, purchaseCount] =
    await Promise.all([
      pool.query('SELECT COUNT(*) FROM patients'),
      pool.query("SELECT COUNT(*) FROM patients WHERE created_at >= now() - interval '30 days'"),
      pool.query("SELECT COUNT(*) FROM visits WHERE visit_date >= now() - interval '30 days'"),
      pool.query('SELECT loyalty_tier, COUNT(*) FROM patients GROUP BY loyalty_tier'),
      pool.query("SELECT response, COUNT(*) FROM followups WHERE response IS NOT NULL GROUP BY response"),
      pool.query(`
        SELECT product_name, COUNT(*) AS times
        FROM (
          SELECT product_name FROM purchases
          UNION ALL
          SELECT p.name AS product_name FROM visit_products vp JOIN products p ON p.id = vp.product_id
        ) t
        GROUP BY product_name
        ORDER BY times DESC
        LIMIT 5
      `),
      pool.query('SELECT COUNT(*) FROM lab_results'),
      pool.query('SELECT COUNT(*) FROM purchases'),
    ]);

  res.json({
    total_patients: Number(totalPatients.rows[0].count),
    new_patients_30d: Number(newPatients.rows[0].count),
    visits_30d: Number(visits30d.rows[0].count),
    tier_breakdown: tierBreakdown.rows,
    followup_outcomes: followupOutcomes.rows,
    top_products: topProducts.rows,
    lab_scans_total: Number(labScans.rows[0].count),
    purchases_total: Number(purchaseCount.rows[0].count),
  });
}));

// Marketing/outreach segments: who to target and why.
router.get('/segments', verifyToken, requireRole('admin'), asyncHandler(async (req, res) => {
  const [inactive, frequentBuyers] = await Promise.all([
    pool.query(`
      SELECT p.id, p.name, p.phone, p.loyalty_tier, MAX(v.visit_date) AS last_visit
      FROM patients p
      LEFT JOIN visits v ON v.patient_id = p.id
      GROUP BY p.id
      HAVING MAX(v.visit_date) IS NULL OR MAX(v.visit_date) < now() - interval '90 days'
      ORDER BY last_visit ASC NULLS FIRST
      LIMIT 100
    `),
    pool.query(`
      SELECT p.id, p.name, p.phone, p.loyalty_tier, COUNT(pu.id) AS purchase_count
      FROM patients p
      JOIN purchases pu ON pu.patient_id = p.id
      GROUP BY p.id
      ORDER BY purchase_count DESC
      LIMIT 20
    `),
  ]);

  res.json({
    inactive_90d: inactive.rows,
    frequent_buyers: frequentBuyers.rows,
  });
}));

// Fires one real push notification on demand, bypassing the daily
// scheduler gate -- so an admin can confirm the whole chain (VAPID keys ->
// service worker -> stored subscription -> delivery) actually works
// without waiting for a real refill/order/message event.
// target 'patient' pushes to the given patientId's own subscription;
// target 'self' (default) pushes to the logged-in admin's own staff
// subscription, e.g. right after enabling it from the Orders page.
router.post('/test-push', verifyToken, requireRole('admin'), asyncHandler(async (req, res) => {
  if (!pushConfigured()) {
    return res.json({ ok: false, reason: 'not_configured' });
  }

  const { target, patientId } = req.body;
  const payload = { title: 'Al Chark', body: 'Test notification -- if you see this, push works.', url: '/' };

  let result;
  if (target === 'patient') {
    if (!patientId || !/^\d+$/.test(String(patientId))) {
      return res.status(400).json({ error: 'patientId is required when target is "patient"' });
    }
    result = await pushToPatientById(Number(patientId), payload);
  } else {
    const { rows } = await pool.query('SELECT push_subscription FROM staff WHERE id = $1', [req.user.id]);
    const subscription = rows[0]?.push_subscription;
    if (!subscription) {
      return res.json({ ok: false, reason: 'no_subscription' });
    }
    result = await sendPush(subscription, payload);
  }

  res.json(result);
}));

module.exports = router;

const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { isConfigured } = require('../lib/googleSheetsClient');
const { runSync, getSettings } = require('../lib/sheetsSyncRunner');
const { SYNCED_FIELDS } = require('../lib/sheetsSyncEngine');

function parseConflictValue(raw) {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw; // conflicts created before this format change, if any
  }
}

const router = express.Router();

// Connection status + the most recent sync, for the top of the Sheets Sync
// screen. Staff/admin only -- this never touches patient data, but the
// sheet ID and sync history are still internal operations detail.
router.get('/status', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const settings = await getSettings();
  const { rows: lastSyncRows } = await pool.query('SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 1');
  const { rows: pendingConflicts } = await pool.query("SELECT COUNT(*)::int AS count FROM sync_conflicts WHERE status = 'pending'");

  res.json({
    configured: isConfigured(),
    sheet_id: settings.sheet_id || null,
    products_tab: settings.products_tab || 'PRODUCTS',
    lifestyle_tab: settings.lifestyle_tab || 'LIFESTYLE',
    auto_sync_enabled: settings.auto_sync_enabled || false,
    auto_sync_interval_hours: settings.auto_sync_interval_hours || 24,
    last_sync: lastSyncRows[0] || null,
    pending_conflicts: pendingConflicts[0].count,
  });
}));

// Sheet ID / tab name / auto-sync toggle -- not secrets, so this is fine to
// store in app_settings and manage from the UI. Credentials themselves stay
// in server-only env vars and are never exposed through this endpoint.
// Admin only, since this changes which external source feeds the catalog.
router.patch('/settings', verifyToken, requireRole('admin'), asyncHandler(async (req, res) => {
  const { sheet_id, products_tab, lifestyle_tab, auto_sync_enabled, auto_sync_interval_hours } = req.body;
  const current = await getSettings();
  const next = {
    sheet_id: sheet_id !== undefined ? (sheet_id || null) : current.sheet_id,
    products_tab: products_tab || current.products_tab || 'PRODUCTS',
    lifestyle_tab: lifestyle_tab || current.lifestyle_tab || 'LIFESTYLE',
    auto_sync_enabled: auto_sync_enabled !== undefined ? !!auto_sync_enabled : (current.auto_sync_enabled || false),
    auto_sync_interval_hours: auto_sync_interval_hours || current.auto_sync_interval_hours || 24,
  };
  await pool.query(
    `UPDATE app_settings SET value = $1, updated_at = now(), updated_by_staff_id = $2 WHERE key = 'google_sheets_sync'`,
    [JSON.stringify(next), req.user.id]
  );
  res.json(next);
}));

// Trigger a sync right now. Staff/admin only.
router.post('/run', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  try {
    const log = await runSync({ syncType: 'manual', triggeredByStaffId: req.user.id });
    res.json(log);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

// Sync history, most recent first.
router.get('/logs', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 30');
  res.json(rows);
}));

// Conflicts needing a staff decision (or, with ?status=, the full history).
router.get('/conflicts', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const status = req.query.status || 'pending';
  const { rows } = await pool.query(
    `SELECT c.*, p.name AS product_name, p.sku AS product_sku, s.name AS resolved_by_name
     FROM sync_conflicts c
     JOIN products p ON p.id = c.product_id
     LEFT JOIN staff s ON s.id = c.resolved_by_staff_id
     WHERE ($1 = 'all' OR c.status = $1)
     ORDER BY c.created_at DESC`,
    [status]
  );
  res.json(rows.map((r) => ({ ...r, app_value: parseConflictValue(r.app_value), sheet_value: parseConflictValue(r.sheet_value) })));
}));

// Resolve one conflict: keep the app's current value (just marks it
// resolved -- the app value is already in place), or apply the sheet's
// value now (and re-baseline that product so future syncs compare
// correctly again).
router.patch('/conflicts/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { resolution } = req.body;
  const validResolutions = ['keep_app', 'use_sheet', 'review_later'];
  if (!validResolutions.includes(resolution)) {
    return res.status(400).json({ error: `resolution must be one of ${validResolutions.join(', ')}` });
  }

  const { rows: conflictRows } = await pool.query('SELECT * FROM sync_conflicts WHERE id = $1', [id]);
  const conflict = conflictRows[0];
  if (!conflict) {
    return res.status(404).json({ error: 'Conflict not found' });
  }

  if (resolution === 'use_sheet') {
    if (!SYNCED_FIELDS.includes(conflict.field_name)) {
      return res.status(400).json({ error: 'Unrecognized field on this conflict' });
    }
    await pool.query(
      `UPDATE products SET ${conflict.field_name} = $1 WHERE id = $2`,
      [parseConflictValue(conflict.sheet_value), conflict.product_id]
    );
  }

  if (resolution !== 'review_later') {
    await pool.query(
      `UPDATE sync_conflicts SET status = $1, resolved_by_staff_id = $2, resolved_at = now() WHERE id = $3`,
      [resolution, req.user.id, id]
    );
    // If every conflict on this product is now resolved, it's safe to
    // re-baseline it so future syncs stop comparing against the stale
    // pre-conflict state.
    const { rows: stillPending } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM sync_conflicts WHERE product_id = $1 AND status = 'pending'`,
      [conflict.product_id]
    );
    if (stillPending[0].count === 0) {
      await pool.query('UPDATE products SET last_synced_at = now() WHERE id = $1', [conflict.product_id]);
    }
  }

  const { rows } = await pool.query('SELECT * FROM sync_conflicts WHERE id = $1', [id]);
  res.json(rows[0]);
}));

module.exports = router;

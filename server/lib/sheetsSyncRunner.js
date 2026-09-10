const pool = require('../db/pool');
const { readSheetTab, isConfigured } = require('./googleSheetsClient');
const { mapSheetRows, computeRowHash, diffProductRow } = require('./sheetsSyncEngine');
const { notifyStaff } = require('./staffNotify');

async function getSettings() {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'google_sheets_sync'");
  return rows[0]?.value || {};
}

function sortedFieldHash(fields) {
  const sorted = Object.keys(fields).sort().reduce((acc, k) => {
    acc[k] = fields[k];
    return acc;
  }, {});
  return computeRowHash(sorted);
}

// Stored as JSON text (not a human-joined string) so a field's original
// type -- a number, an array for allergens/tags, whatever -- round-trips
// exactly if a conflict is later resolved with "Use sheet".
function serializeForConflict(value) {
  return value == null ? null : JSON.stringify(value);
}

// Applies one sheet row against the matching product (by SKU). Returns
// which bucket it landed in so the caller can total up the sync's counts.
async function syncOneRow(row, syncLogId) {
  const { _row, ...fields } = row;
  const sku = fields.sku ? String(fields.sku).trim() : null;
  const name = fields.name ? String(fields.name).trim() : null;
  if (!sku && !name) {
    return { bucket: 'skipped', warning: `Row ${_row}: skipped -- no SKU or product name` };
  }

  const rowHash = sortedFieldHash(fields);

  let existing = null;
  if (sku) {
    const { rows } = await pool.query('SELECT * FROM products WHERE sku = $1', [sku]);
    existing = rows[0] || null;
  }

  if (existing && existing.sheet_row_hash === rowHash) {
    return { bucket: 'skipped' }; // unchanged since the last time this row was read
  }

  const { changes, conflicts, isNew } = diffProductRow({ existingProduct: existing, incoming: fields });

  if (isNew) {
    if (!name) {
      return { bucket: 'skipped', warning: `Row ${_row}: skipped -- a new product needs at least a name` };
    }
    // New products start hidden (draft, not active) until staff approve them
    // -- a sync should never make something purchasable on its own.
    const cols = ['approval_status', 'sheet_row_hash', 'external_sheet_row', 'last_synced_at', 'is_active', ...Object.keys(changes)];
    const values = ['draft', rowHash, _row, new Date(), false, ...Object.values(changes)];
    const placeholders = values.map((_, i) => `$${i + 1}`);
    await pool.query(`INSERT INTO products (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`, values);
    return { bucket: 'created' };
  }

  const setParts = [];
  const values = [];
  let i = 1;
  for (const [field, value] of Object.entries(changes)) {
    setParts.push(`${field} = $${i++}`);
    values.push(value);
  }
  setParts.push(`external_sheet_row = $${i++}`);
  values.push(_row);

  const newConflicts = [];
  for (const conflict of conflicts) {
    const { rows: pending } = await pool.query(
      `SELECT id FROM sync_conflicts WHERE product_id = $1 AND field_name = $2 AND status = 'pending'`,
      [existing.id, conflict.field]
    );
    if (pending.length === 0) newConflicts.push(conflict);
  }

  // Only advance the sync baseline when nothing is left unresolved for this
  // product -- otherwise the next sync would compare against a baseline
  // newer than the staff edit that caused the conflict, and silently
  // overwrite it once enough time has passed instead of keeping it flagged.
  if (conflicts.length === 0) {
    setParts.push(`sheet_row_hash = $${i++}`);
    values.push(rowHash);
    setParts.push(`last_synced_at = $${i++}`);
    values.push(new Date());
  }
  values.push(existing.id);
  await pool.query(`UPDATE products SET ${setParts.join(', ')} WHERE id = $${i}`, values);

  for (const conflict of newConflicts) {
    await pool.query(
      `INSERT INTO sync_conflicts (sync_log_id, product_id, field_name, app_value, sheet_value)
       VALUES ($1, $2, $3, $4, $5)`,
      [syncLogId, existing.id, conflict.field, serializeForConflict(conflict.appValue), serializeForConflict(conflict.sheetValue)]
    );
  }

  if (newConflicts.length > 0) return { bucket: 'conflicted', count: newConflicts.length };
  if (Object.keys(changes).length > 0) return { bucket: 'updated' };
  return { bucket: 'skipped' };
}

async function runSync({ syncType = 'manual', triggeredByStaffId = null } = {}) {
  if (!isConfigured()) {
    throw new Error('Google Sheets is not configured yet (missing service account credentials).');
  }
  const settings = await getSettings();
  if (!settings.sheet_id) {
    throw new Error('No Google Sheet is connected yet -- set a Sheet ID in Sheets Sync settings first.');
  }

  const { rows: logRows } = await pool.query(
    `INSERT INTO sync_logs (sync_type, status, triggered_by_staff_id) VALUES ($1, 'running', $2) RETURNING *`,
    [syncType, triggeredByStaffId]
  );
  const syncLog = logRows[0];

  const counts = { created: 0, updated: 0, skipped: 0, conflicted: 0 };
  const errors = [];
  const warnings = [];

  try {
    const values = await readSheetTab(settings.sheet_id, settings.products_tab || 'PRODUCTS');
    const { rows, unmatchedHeaders } = mapSheetRows(values);
    if (unmatchedHeaders.length > 0) {
      warnings.push(`Unrecognized columns ignored: ${unmatchedHeaders.join(', ')}`);
    }

    for (const row of rows) {
      try {
        const result = await syncOneRow(row, syncLog.id);
        if (result.warning) warnings.push(result.warning);
        if (result.bucket === 'created') counts.created += 1;
        else if (result.bucket === 'updated') counts.updated += 1;
        else if (result.bucket === 'skipped') counts.skipped += 1;
        else if (result.bucket === 'conflicted') counts.conflicted += result.count;
      } catch (err) {
        errors.push(`Row ${row._row}: ${err.message}`);
      }
    }

    const status = errors.length > 0
      ? (counts.created + counts.updated + counts.conflicted > 0 ? 'partial' : 'failed')
      : 'success';

    const { rows: finished } = await pool.query(
      `UPDATE sync_logs SET status = $1, finished_at = now(), rows_created = $2, rows_updated = $3,
         rows_skipped = $4, rows_conflicted = $5, errors = $6, warnings = $7
       WHERE id = $8 RETURNING *`,
      [status, counts.created, counts.updated, counts.skipped, counts.conflicted, JSON.stringify(errors), JSON.stringify(warnings), syncLog.id]
    );

    if (counts.conflicted > 0 || errors.length > 0) {
      const parts = [`${counts.created} new`, `${counts.updated} updated`];
      if (counts.conflicted > 0) parts.push(`${counts.conflicted} conflict(s) need review`);
      if (errors.length > 0) parts.push(`${errors.length} error(s)`);
      notifyStaff(`Google Sheets sync finished: ${parts.join(', ')}.`, { title: 'Sheets sync', url: '/staff/sheets-sync' })
        .catch((err) => console.error('Sheets sync notify error:', err.message));
    }

    return finished[0];
  } catch (err) {
    const { rows: failed } = await pool.query(
      `UPDATE sync_logs SET status = 'failed', finished_at = now(), errors = $1 WHERE id = $2 RETURNING *`,
      [JSON.stringify([err.message]), syncLog.id]
    );
    notifyStaff(`Google Sheets sync failed: ${err.message}`, { title: 'Sheets sync failed', url: '/staff/sheets-sync' })
      .catch((notifyErr) => console.error('Sheets sync notify error:', notifyErr.message));
    return failed[0];
  }
}

// Checked on a fixed timer (see index.js) rather than run via a real cron
// job -- there's no job-queue infrastructure in this app yet, and re-
// checking "has enough time passed since the last sync?" against
// auto_sync_interval_hours every time is cheap and self-correcting even if
// a check gets missed (a deploy restart, etc).
async function maybeRunAutoSync() {
  if (!isConfigured()) return;
  const settings = await getSettings();
  if (!settings.auto_sync_enabled || !settings.sheet_id) return;

  const { rows } = await pool.query('SELECT started_at FROM sync_logs ORDER BY started_at DESC LIMIT 1');
  const last = rows[0]?.started_at;
  const intervalMs = (settings.auto_sync_interval_hours || 24) * 60 * 60 * 1000;
  if (last && Date.now() - new Date(last).getTime() < intervalMs) return;

  await runSync({ syncType: 'auto' });
}

module.exports = { runSync, getSettings, maybeRunAutoSync };

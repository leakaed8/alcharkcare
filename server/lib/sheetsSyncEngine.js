const crypto = require('crypto');
const { matchField } = require('./productImport');

const NUMERIC_FIELDS = new Set(['price', 'cost', 'stock_qty', 'min_stock', 'duration_days']);
const ARRAY_FIELDS = new Set(['allergens', 'tags']);
const BOOLEAN_FIELDS = new Set(['recommendation_eligible']);
const TRUE_VALUES = new Set(['true', 'yes', 'y', '1']);

// Fields a sync is allowed to touch. Deliberately excludes things this
// phase doesn't own: is_active/approval_status (governed by the approval
// workflow, not overwritten by a re-sync) and sync bookkeeping itself.
// image_url is included as a bulk alternative to uploading photos one at a
// time in Product Manager -- the same conflict protection applies, so a
// staff-uploaded photo (which bumps updated_at, see products.js) is never
// silently replaced by a sheet's image_url without staff resolving it.
const SYNCED_FIELDS = [
  'name', 'brand', 'category', 'subcategory', 'sku', 'barcode', 'price', 'cost',
  'stock_qty', 'min_stock', 'duration_days', 'description', 'benefits', 'ingredients',
  'directions_for_use', 'frequency', 'supplier', 'country', 'allergens', 'tags', 'image_url',
  'reminder_frequency', 'daily_reminder_message',
];

function coerceValue(field, raw) {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (str === '') return null;
  if (NUMERIC_FIELDS.has(field)) {
    const n = Number(str);
    return Number.isFinite(n) ? n : null;
  }
  if (ARRAY_FIELDS.has(field)) {
    return str.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  if (BOOLEAN_FIELDS.has(field)) {
    return TRUE_VALUES.has(str.toLowerCase());
  }
  return str;
}

// Turns the raw 2D array the Sheets API returns (row 0 = headers) into the
// same normalized-row shape parseProductWorkbook produces from an .xlsx --
// one shared header-matching vocabulary for both import paths.
function mapSheetRows(values) {
  if (!values || values.length === 0) return { rows: [], unmatchedHeaders: [] };
  const [headerRow, ...dataRows] = values;
  const headerMap = {}; // column index -> field name
  const unmatchedHeaders = [];
  headerRow.forEach((h, i) => {
    const field = matchField(h);
    if (field) headerMap[i] = field;
    else if (String(h || '').trim()) unmatchedHeaders.push(String(h).trim());
  });

  const rows = [];
  dataRows.forEach((raw, i) => {
    const entry = { _row: i + 2 }; // +2: 1-indexed, plus the header row itself
    let hasAnyValue = false;
    for (const [colIndex, field] of Object.entries(headerMap)) {
      const value = raw[Number(colIndex)];
      if (value != null && String(value).trim() !== '') hasAnyValue = true;
      entry[field] = coerceValue(field, value);
    }
    if (hasAnyValue) rows.push(entry);
  });

  return { rows, unmatchedHeaders };
}

// A stable hash of a row's cell values, used to skip re-processing a row
// that hasn't changed since the last sync (incremental sync).
function computeRowHash(rawRow) {
  return crypto.createHash('md5').update(JSON.stringify(rawRow || [])).digest('hex');
}

function valuesEqual(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    return arrA.length === arrB.length && arrA.every((v, i) => v === arrB[i]);
  }
  if (typeof a === 'number' || typeof b === 'number') {
    return Number(a) === Number(b);
  }
  return String(a ?? '') === String(b ?? '');
}

// Compares an incoming sheet row to the current product row and decides,
// field by field, whether to apply the sheet's value or flag a conflict.
// `neverSynced` (existingProduct.last_synced_at == null) means there's no
// baseline to compare an in-app edit against, so the very first sync for a
// product always just applies the sheet's values -- exactly like a fresh
// Excel import -- rather than manufacturing conflicts against a baseline
// that never existed.
function diffProductRow({ existingProduct, incoming }) {
  const changes = {};
  const conflicts = [];

  if (!existingProduct) {
    for (const field of SYNCED_FIELDS) {
      if (incoming[field] !== undefined && incoming[field] !== null) changes[field] = incoming[field];
    }
    return { changes, conflicts, isNew: true };
  }

  const neverSynced = existingProduct.last_synced_at == null;
  const editedSinceLastSync = !neverSynced && existingProduct.updated_at > existingProduct.last_synced_at;

  for (const field of SYNCED_FIELDS) {
    if (incoming[field] === undefined) continue; // sheet doesn't carry this column at all
    const sheetValue = incoming[field];
    const appValue = existingProduct[field];
    if (valuesEqual(appValue, sheetValue)) continue;

    if (editedSinceLastSync) {
      conflicts.push({ field, appValue, sheetValue });
    } else {
      changes[field] = sheetValue;
    }
  }

  return { changes, conflicts, isNew: false };
}

module.exports = { mapSheetRows, computeRowHash, diffProductRow, SYNCED_FIELDS };

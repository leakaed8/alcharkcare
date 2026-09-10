const ExcelJS = require('exceljs');

// Accepts a variety of common header spellings so staff don't have to
// massage their existing spreadsheet to match our exact column names. Also
// reused by the Google Sheets sync (googleSheetsSync.js) so both import
// paths recognize the same column names.
const HEADER_SYNONYMS = {
  name: ['name', 'product name', 'product', 'item', 'item name'],
  brand: ['brand', 'manufacturer', 'maker'],
  category: ['category', 'type'],
  subcategory: ['subcategory', 'sub-category', 'sub category'],
  sku: ['sku', 'code', 'item code', 'product code'],
  barcode: ['barcode', 'upc', 'ean'],
  price: ['price', 'unit price', 'sale price', 'selling price'],
  cost: ['cost', 'wholesale cost', 'cost price'],
  stock_qty: ['stock', 'stock qty', 'quantity', 'qty', 'stock quantity', 'inventory'],
  min_stock: ['min stock', 'minimum stock', 'reorder level', 'min stock level'],
  duration_days: ['duration', 'duration days', 'duration (days)', 'days supply'],
  description: ['description', 'desc', 'notes'],
  benefits: ['benefits', 'benefit'],
  ingredients: ['ingredients', 'ingredient list'],
  directions_for_use: ['directions', 'directions for use', 'administration', 'how to use'],
  frequency: ['frequency', 'usage frequency'],
  supplier: ['supplier', 'vendor'],
  country: ['country', 'country of origin', 'origin'],
  allergens: ['allergens', 'allergen', 'allergen warning'],
  tags: ['tags', 'keywords'],
};

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase();
}

function matchField(header) {
  const normalized = normalizeHeader(header);
  for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS)) {
    if (synonyms.includes(normalized)) return field;
  }
  return null;
}

// Parses an uploaded .xlsx buffer into normalized product rows. Does not
// touch the database -- callers decide whether to preview or commit.
async function parseProductWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { rows: [], unmatchedHeaders: [] };
  }

  let headerMap = {}; // column index -> field name
  const unmatchedHeaders = [];
  const rows = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const field = matchField(cell.value);
        if (field) headerMap[colNumber] = field;
        else if (String(cell.value || '').trim()) unmatchedHeaders.push(String(cell.value).trim());
      });
      return;
    }

    const entry = { _row: rowNumber };
    let hasAnyValue = false;
    for (const [colNumber, field] of Object.entries(headerMap)) {
      const cell = row.getCell(Number(colNumber));
      let value = cell.value;
      if (value != null && typeof value === 'object' && 'result' in value) value = value.result; // formula cell
      if (value != null && value !== '') hasAnyValue = true;
      entry[field] = value;
    }
    if (hasAnyValue) rows.push(entry);
  });

  return { rows, unmatchedHeaders };
}

module.exports = { parseProductWorkbook, matchField, normalizeHeader };

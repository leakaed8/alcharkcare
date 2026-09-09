const express = require('express');
const multer = require('multer');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const upload = require('../lib/upload');
const asyncHandler = require('../lib/asyncHandler');
const { parseProductWorkbook } = require('../lib/productImport');
const { uploadProductImage, isConfigured: cloudinaryConfigured } = require('../lib/cloudinaryUpload');

const router = express.Router();

const spreadsheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /spreadsheet|excel/.test(file.mimetype) || /\.xlsx$/i.test(file.originalname || '');
    cb(ok ? null : new Error('Only .xlsx files are allowed'), ok);
  },
});

const SELECT_COLUMNS = 'id, name, category, sku, price, stock_qty, duration_days, description, image_url, allergens, is_active';

// Full product list for staff catalog management. Staff only.
router.get('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT ${SELECT_COLUMNS} FROM products ORDER BY name`);
  res.json(rows);
}));

// Patient-facing catalog: active products only, any signed-in user.
router.get('/catalog', verifyToken, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, category, price, description, image_url FROM products WHERE is_active = true ORDER BY category, name`
  );
  res.json(rows);
}));

// Suggested products for a patient: matched by skin/hair type and by
// nutrients recently flagged low/deficient/borderline on their labs, with
// anything overlapping a recorded allergen excluded. Read-only -- never
// added to a cart automatically.
router.get('/suggestions/:patientId', verifyToken, asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  if (!isStaff && String(req.user.id) !== String(patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows: patientRows } = await pool.query(
    'SELECT skin_type, hair_type, allergies FROM patients WHERE id = $1',
    [patientId]
  );
  const patient = patientRows[0];
  if (!patient) {
    return res.status(404).json({ error: 'Patient not found' });
  }
  const allergies = (patient.allergies || []).map((a) => a.toLowerCase());

  const { rows: lowNutrients } = await pool.query(
    `SELECT DISTINCT tt.nutrient_key
     FROM lab_result_markers lrm
     JOIN lab_results lr ON lr.id = lrm.lab_result_id
     JOIN lab_test_types tt ON tt.key = lrm.nutrient_key
     WHERE lr.patient_id = $1
       AND lrm.nutritional_status IN ('LOW', 'DEFICIENT', 'BORDERLINE')
       AND tt.nutrient_key IS NOT NULL`,
    [patientId]
  );
  const nutrientKeys = lowNutrients.map((r) => r.nutrient_key);
  const { rows: nutrientRows } = await pool.query('SELECT key, name FROM nutrients WHERE key = ANY($1::text[])', [nutrientKeys]);
  const nutrientNameByKey = new Map(nutrientRows.map((n) => [n.key, n.name]));

  const { rows: candidates } = await pool.query(
    `SELECT DISTINCT p.id, p.name, p.category, p.price, p.description, p.image_url, p.allergens,
            CASE WHEN p.category = ANY($1::text[]) THEN true ELSE false END AS matches_profile,
            (SELECT array_agg(DISTINCT pn.nutrient_key) FROM product_nutrients pn WHERE pn.product_id = p.id AND pn.nutrient_key = ANY($2::text[])) AS matched_nutrients
     FROM products p
     WHERE p.is_active = true
       AND (p.category = ANY($1::text[]) OR EXISTS (
         SELECT 1 FROM product_nutrients pn WHERE pn.product_id = p.id AND pn.nutrient_key = ANY($2::text[])
       ))`,
    [[patient.skin_type, patient.hair_type].filter(Boolean), nutrientKeys]
  );

  const suggestions = candidates
    .filter((p) => !(p.allergens || []).some((a) => allergies.includes(String(a).toLowerCase())))
    .map((p) => {
      const reasons = [];
      if (p.matches_profile) reasons.push(`Matches your profile (${patient.skin_type || patient.hair_type})`);
      if (p.matched_nutrients?.length > 0) {
        const names = p.matched_nutrients.map((k) => nutrientNameByKey.get(k) || k);
        reasons.push(`Supplies ${names.join(', ')}, recently flagged on your labs`);
      }
      return { id: p.id, name: p.name, category: p.category, price: p.price, description: p.description, image_url: p.image_url, reasons };
    });

  res.json(suggestions);
}));

// Preview or commit a bulk product import from an .xlsx spreadsheet.
// Staff/admin only. Upserts by SKU when present; rows without a SKU are
// always inserted as new (there's nothing to match them against).
router.post('/import', verifyToken, requireRole('staff', 'admin'), spreadsheetUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'file is required' });
  }
  const preview = req.query.preview === 'true';

  const { rows, unmatchedHeaders } = await parseProductWorkbook(req.file.buffer);
  if (rows.length === 0) {
    return res.status(400).json({ error: 'No product rows found in that file', unmatchedHeaders });
  }

  const results = { created: 0, updated: 0, skipped: [] };
  const previewRows = [];

  for (const row of rows) {
    const name = row.name ? String(row.name).trim() : '';
    if (!name) {
      results.skipped.push({ row: row._row, reason: 'Missing product name' });
      continue;
    }
    const sku = row.sku != null && String(row.sku).trim() ? String(row.sku).trim() : null;
    const category = row.category ? String(row.category).trim() : null;
    const price = row.price === '' || row.price == null ? null : Number(row.price);
    const stockQty = row.stock_qty === '' || row.stock_qty == null ? 0 : Number(row.stock_qty);
    const durationDays = row.duration_days === '' || row.duration_days == null ? null : Number(row.duration_days);
    const description = row.description ? String(row.description).trim() : null;
    const allergens = row.allergens
      ? String(row.allergens).split(',').map((a) => a.trim().toLowerCase()).filter(Boolean)
      : null;

    if (preview) {
      previewRows.push({ row: row._row, name, sku, category, price, stock_qty: stockQty, duration_days: durationDays, description, allergens });
      continue;
    }

    if (sku) {
      const existing = await pool.query('SELECT id FROM products WHERE sku = $1', [sku]);
      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE products SET name = $1, category = COALESCE($2, category), price = COALESCE($3, price),
             stock_qty = COALESCE($4, stock_qty), duration_days = COALESCE($5, duration_days),
             description = COALESCE($6, description), allergens = COALESCE($7, allergens)
           WHERE id = $8`,
          [name, category, price, stockQty, durationDays, description, allergens, existing.rows[0].id]
        );
        results.updated += 1;
        continue;
      }
    }

    await pool.query(
      `INSERT INTO products (name, category, sku, price, stock_qty, duration_days, description, allergens)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [name, category, sku, price, stockQty, durationDays, description, allergens]
    );
    results.created += 1;
  }

  if (preview) {
    return res.json({ preview: true, rows: previewRows, unmatchedHeaders });
  }
  res.json({ preview: false, unmatchedHeaders, ...results });
}));

// Upload/replace a product's photo. Stored on a free image host
// (Cloudinary) -- only the resulting URL is saved here, never the image
// bytes, so this doesn't grow the app's own database or disk. Staff/admin only.
router.post('/:id/image', verifyToken, requireRole('staff', 'admin'), upload.single('image'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!req.file) {
    return res.status(400).json({ error: 'image is required' });
  }
  if (!cloudinaryConfigured()) {
    return res.status(503).json({ error: 'Image hosting is not configured yet (set CLOUDINARY_URL on the server).' });
  }

  const existing = await pool.query('SELECT id FROM products WHERE id = $1', [id]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const imageUrl = await uploadProductImage(req.file.buffer, req.file.mimetype, id);
  const { rows } = await pool.query(
    `UPDATE products SET image_url = $1 WHERE id = $2 RETURNING ${SELECT_COLUMNS}`,
    [imageUrl, id]
  );
  res.json(rows[0]);
}));

// Add a product to the catalog. Staff only.
router.post('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { name, category, sku, price, stock_qty, duration_days, description, allergens } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  if (sku) {
    const existing = await pool.query('SELECT id FROM products WHERE sku = $1', [sku]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A product with this SKU already exists' });
    }
  }

  const allergenList = Array.isArray(allergens)
    ? allergens
    : (allergens || '').split(',').map((a) => a.trim().toLowerCase()).filter(Boolean);

  const { rows } = await pool.query(
    `INSERT INTO products (name, category, sku, price, stock_qty, duration_days, description, allergens)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${SELECT_COLUMNS}`,
    [
      name,
      category || null,
      sku || null,
      price === '' || price == null ? null : price,
      stock_qty === '' || stock_qty == null ? 0 : stock_qty,
      duration_days === '' || duration_days == null ? null : duration_days,
      description || null,
      allergenList.length > 0 ? allergenList : null,
    ]
  );
  res.status(201).json(rows[0]);
}));

// Edit a product's catalog details. Staff only.
router.patch('/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, category, sku, price, stock_qty, duration_days, description, allergens, is_active } = req.body;

  if (sku) {
    const existing = await pool.query('SELECT id FROM products WHERE sku = $1 AND id != $2', [sku, id]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A product with this SKU already exists' });
    }
  }

  const allergenList = allergens == null
    ? null
    : Array.isArray(allergens)
      ? allergens
      : allergens.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean);

  const { rows } = await pool.query(
    `UPDATE products SET
       name = COALESCE($1, name),
       category = COALESCE($2, category),
       sku = COALESCE($3, sku),
       price = COALESCE($4, price),
       stock_qty = COALESCE($5, stock_qty),
       duration_days = COALESCE($6, duration_days),
       description = COALESCE($7, description),
       allergens = COALESCE($8, allergens),
       is_active = COALESCE($9, is_active)
     WHERE id = $10
     RETURNING ${SELECT_COLUMNS}`,
    [name || null, category || null, sku || null, price ?? null, stock_qty ?? null, duration_days ?? null, description || null, allergenList, is_active ?? null, id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(rows[0]);
}));

module.exports = router;

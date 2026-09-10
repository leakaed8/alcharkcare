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

const SELECT_COLUMNS = 'id, name, brand, category, sku, price, stock_qty, duration_days, description, image_url, allergens, is_active';
// Staff catalog management sees the fuller picture: sync/import-only fields,
// the approval workflow state, and internal-only figures (cost, supplier)
// that never belong on a patient-facing response.
const STAFF_SELECT_COLUMNS = `${SELECT_COLUMNS}, subcategory, barcode, cost, min_stock, supplier, country, tags,
  benefits, ingredients, directions_for_use, frequency, recommendation_eligible, approval_status, last_synced_at, updated_at,
  reminder_frequency, daily_reminder_message`;
const REMINDER_FREQUENCIES = ['none', 'daily'];
// Patient-facing product detail: the safe columns plus the descriptive,
// catalog-level "how to use it" fields -- never the internal-only ones
// (cost, supplier, barcode, etc) that STAFF_SELECT_COLUMNS carries.
const PRODUCT_DETAIL_COLUMNS = `${SELECT_COLUMNS}, benefits, ingredients, directions_for_use, frequency`;
const APPROVAL_STATUSES = ['draft', 'review_required', 'approved', 'published'];
const LOW_STOCK_THRESHOLD = 5;

// GREEN: available. ORANGE: low stock. RED: active but out of stock.
// GRAY: not currently carried (staff has hidden/discontinued it). Always
// paired with a text label -- color is never the only signal.
function computeAvailability(product) {
  if (!product.is_active) return { level: 'gray', label: 'Not currently carried' };
  if (product.stock_qty == null || product.stock_qty <= 0) return { level: 'red', label: 'Currently unavailable' };
  if (product.stock_qty <= LOW_STOCK_THRESHOLD) return { level: 'orange', label: 'Low stock' };
  return { level: 'green', label: 'Available at Al Chark' };
}

// "Running low?" reorder suggestions -- estimates when a product a patient
// is using will run out, from whichever is more recent: the routine item's
// started_date, or their last purchase of it. Only products with a known
// duration_days (how long a supply lasts) can be estimated; nothing is
// guessed for products without one. Flags anything due within a week
// (including already overdue) as worth a reorder nudge.
router.get('/reorder/:patientId', verifyToken, asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  if (!isStaff && String(req.user.id) !== String(patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    `WITH anchors AS (
       SELECT vp.product_id, vp.started_date AS anchor_date
       FROM visit_products vp JOIN visits v ON v.id = vp.visit_id
       WHERE v.patient_id = $1 AND vp.status = 'started' AND vp.started_date IS NOT NULL
       UNION ALL
       SELECT pu.product_id, pu.purchased_at::date AS anchor_date
       FROM purchases pu
       WHERE pu.patient_id = $1 AND pu.product_id IS NOT NULL
     ),
     latest AS (
       SELECT product_id, MAX(anchor_date) AS anchor_date FROM anchors GROUP BY product_id
     )
     SELECT p.id, p.name, p.brand, p.category, p.price, p.image_url, p.stock_qty, p.is_active,
            l.anchor_date, p.duration_days,
            (l.anchor_date + (p.duration_days || ' days')::interval)::date AS estimated_runout_date,
            ((l.anchor_date + (p.duration_days || ' days')::interval)::date - CURRENT_DATE) AS days_remaining
     FROM latest l
     JOIN products p ON p.id = l.product_id
     WHERE p.duration_days IS NOT NULL AND p.is_active = true
       AND (l.anchor_date + (p.duration_days || ' days')::interval)::date <= CURRENT_DATE + INTERVAL '7 days'
     ORDER BY days_remaining ASC`,
    [patientId]
  );

  res.json(rows.map((p) => ({ ...p, availability: computeAvailability(p) })));
}));

// Full product list for staff catalog management. Staff only. Optional
// ?approval_status= filter, used by the "needs review" queue for products
// a Sheets sync created as drafts.
router.get('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { approval_status } = req.query;
  if (approval_status && !APPROVAL_STATUSES.includes(approval_status)) {
    return res.status(400).json({ error: `approval_status must be one of ${APPROVAL_STATUSES.join(', ')}` });
  }
  const { rows } = await pool.query(
    `SELECT ${STAFF_SELECT_COLUMNS} FROM products WHERE ($1::text IS NULL OR approval_status = $1) ORDER BY name`,
    [approval_status || null]
  );
  res.json(rows);
}));

// Patient-facing catalog: active products only, any signed-in user.
router.get('/catalog', verifyToken, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, brand, category, price, description, image_url, stock_qty, is_active, tags
     FROM products WHERE is_active = true ORDER BY category, name`
  );
  res.json(rows.map((p) => ({ ...p, availability: computeAvailability(p) })));
}));

// Patient-facing product search -- includes inactive products (as GRAY
// "not currently carried") so a search never falsely reads as "we don't
// have this" when really it's just discontinued. Searches name/brand/
// category; SKU is staff-internal so it's not part of this search.
router.get('/search', verifyToken, asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);

  const { rows } = await pool.query(
    `SELECT ${SELECT_COLUMNS} FROM products
     WHERE name ILIKE $1 OR brand ILIKE $1 OR category ILIKE $1
     ORDER BY is_active DESC, name LIMIT 40`,
    [`%${q}%`]
  );
  res.json(rows.map((p) => ({ ...p, availability: computeAvailability(p) })));
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
    `SELECT DISTINCT p.id, p.name, p.brand, p.category, p.price, p.description, p.image_url, p.allergens, p.stock_qty, p.is_active,
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
      return { id: p.id, name: p.name, brand: p.brand, category: p.category, price: p.price, description: p.description, image_url: p.image_url, availability: computeAvailability(p), reasons };
    });

  res.json(suggestions);
}));

// Product detail. Any signed-in user. If this patient was personally
// recommended this product during a visit, surfaces that (and which visit)
// so the portal can show "Recommended for you during your <date> visit" --
// continuity between the consultation and the product, not just a generic
// catalog page.
router.get('/:id', verifyToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid product id' });
  }

  const { rows } = await pool.query(`SELECT ${PRODUCT_DETAIL_COLUMNS} FROM products WHERE id = $1`, [id]);
  const product = rows[0];
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  let recommendation = null;
  if (req.user.role === 'patient') {
    const { rows: recs } = await pool.query(
      `SELECT vp.id AS visit_product_id, vp.reason, vp.dosing_notes, vp.status, v.visit_date
       FROM visit_products vp
       JOIN visits v ON v.id = vp.visit_id
       WHERE vp.product_id = $1 AND v.patient_id = $2 AND vp.patient_visible = true
       ORDER BY v.visit_date DESC LIMIT 1`,
      [id, req.user.id]
    );
    recommendation = recs[0] || null;
  }

  const { rows: related } = await pool.query(
    `SELECT id, name, brand, price, image_url, stock_qty, is_active FROM products
     WHERE category = $1 AND id != $2 AND is_active = true
     ORDER BY name LIMIT 4`,
    [product.category, id]
  );

  res.json({
    ...product,
    availability: computeAvailability(product),
    recommendation,
    related_products: related.map((p) => ({ ...p, availability: computeAvailability(p) })),
  });
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
    const brand = row.brand ? String(row.brand).trim() : null;
    const sku = row.sku != null && String(row.sku).trim() ? String(row.sku).trim() : null;
    const category = row.category ? String(row.category).trim() : null;
    const price = row.price === '' || row.price == null ? null : Number(row.price);
    const stockQty = row.stock_qty === '' || row.stock_qty == null ? 0 : Number(row.stock_qty);
    const durationDays = row.duration_days === '' || row.duration_days == null ? null : Number(row.duration_days);
    const description = row.description ? String(row.description).trim() : null;
    const allergens = row.allergens
      ? String(row.allergens).split(',').map((a) => a.trim().toLowerCase()).filter(Boolean)
      : null;
    const imageUrl = row.image_url ? String(row.image_url).trim() : null;

    if (preview) {
      previewRows.push({ row: row._row, name, brand, sku, category, price, stock_qty: stockQty, duration_days: durationDays, description, allergens, image_url: imageUrl });
      continue;
    }

    if (sku) {
      const existing = await pool.query('SELECT id FROM products WHERE sku = $1', [sku]);
      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE products SET name = $1, brand = COALESCE($2, brand), category = COALESCE($3, category), price = COALESCE($4, price),
             stock_qty = COALESCE($5, stock_qty), duration_days = COALESCE($6, duration_days),
             description = COALESCE($7, description), allergens = COALESCE($8, allergens), image_url = COALESCE($9, image_url), updated_at = now()
           WHERE id = $10`,
          [name, brand, category, price, stockQty, durationDays, description, allergens, imageUrl, existing.rows[0].id]
        );
        results.updated += 1;
        continue;
      }
    }

    await pool.query(
      `INSERT INTO products (name, brand, category, sku, price, stock_qty, duration_days, description, allergens, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [name, brand, category, sku, price, stockQty, durationDays, description, allergens, imageUrl]
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
    `UPDATE products SET image_url = $1, updated_at = now() WHERE id = $2 RETURNING ${SELECT_COLUMNS}`,
    [imageUrl, id]
  );
  res.json(rows[0]);
}));

// Add a product to the catalog. Staff only.
router.post('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { name, brand, category, sku, price, stock_qty, duration_days, description, allergens } = req.body;
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
    `INSERT INTO products (name, brand, category, sku, price, stock_qty, duration_days, description, allergens)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${SELECT_COLUMNS}`,
    [
      name,
      brand || null,
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

// Edit a product's catalog details. Staff only. Bumps `updated_at`, which
// the Google Sheets sync compares against `last_synced_at` to tell whether
// this product was edited in-app since its last sync -- so an edit here can
// surface as a conflict next sync rather than being silently overwritten.
router.patch('/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    name, brand, category, subcategory, sku, barcode, price, cost, stock_qty, min_stock, duration_days,
    description, benefits, ingredients, directions_for_use, frequency, supplier, country,
    allergens, tags, recommendation_eligible, is_active, reminder_frequency, daily_reminder_message,
  } = req.body;

  if (sku) {
    const existing = await pool.query('SELECT id FROM products WHERE sku = $1 AND id != $2', [sku, id]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A product with this SKU already exists' });
    }
  }
  if (reminder_frequency && !REMINDER_FREQUENCIES.includes(reminder_frequency)) {
    return res.status(400).json({ error: `reminder_frequency must be one of ${REMINDER_FREQUENCIES.join(', ')}` });
  }

  const toList = (value) => (value == null ? null : Array.isArray(value) ? value : String(value).split(',').map((a) => a.trim().toLowerCase()).filter(Boolean));
  const allergenList = toList(allergens);
  const tagList = toList(tags);

  const { rows } = await pool.query(
    `UPDATE products SET
       name = COALESCE($1, name),
       brand = COALESCE($2, brand),
       category = COALESCE($3, category),
       subcategory = COALESCE($4, subcategory),
       sku = COALESCE($5, sku),
       barcode = COALESCE($6, barcode),
       price = COALESCE($7, price),
       cost = COALESCE($8, cost),
       stock_qty = COALESCE($9, stock_qty),
       min_stock = COALESCE($10, min_stock),
       duration_days = COALESCE($11, duration_days),
       description = COALESCE($12, description),
       benefits = COALESCE($13, benefits),
       ingredients = COALESCE($14, ingredients),
       directions_for_use = COALESCE($15, directions_for_use),
       frequency = COALESCE($16, frequency),
       supplier = COALESCE($17, supplier),
       country = COALESCE($18, country),
       allergens = COALESCE($19, allergens),
       tags = COALESCE($20, tags),
       recommendation_eligible = COALESCE($21, recommendation_eligible),
       is_active = COALESCE($22, is_active),
       reminder_frequency = COALESCE($23, reminder_frequency),
       daily_reminder_message = COALESCE($24, daily_reminder_message),
       updated_at = now()
     WHERE id = $25
     RETURNING ${STAFF_SELECT_COLUMNS}`,
    [
      name || null, brand || null, category || null, subcategory || null, sku || null, barcode || null,
      price ?? null, cost ?? null, stock_qty ?? null, min_stock ?? null, duration_days ?? null,
      description || null, benefits || null, ingredients || null, directions_for_use || null, frequency || null,
      supplier || null, country || null, allergenList, tagList, recommendation_eligible ?? null, is_active ?? null,
      reminder_frequency || null, daily_reminder_message || null, id,
    ]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(rows[0]);
}));

// Move a product through the approval workflow (draft -> review_required ->
// approved -> published), e.g. after a Google Sheets sync creates a draft.
// Publishing also makes it visible in the shop, since a sync should never
// make something purchasable on its own. Staff only.
router.patch('/:id/approval', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { approval_status } = req.body;
  if (!APPROVAL_STATUSES.includes(approval_status)) {
    return res.status(400).json({ error: `approval_status must be one of ${APPROVAL_STATUSES.join(', ')}` });
  }

  const { rows } = await pool.query(
    `UPDATE products SET approval_status = $1, is_active = CASE WHEN $1 = 'published' THEN true ELSE is_active END
     WHERE id = $2 RETURNING ${STAFF_SELECT_COLUMNS}`,
    [approval_status, id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(rows[0]);
}));

module.exports = router;

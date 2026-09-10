const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { sendPush, isConfigured: pushConfigured } = require('../lib/pushNotify');

const router = express.Router();

const TYPES = ['percentage', 'fixed', 'special_price', 'bogo'];

function toList(value) {
  if (value == null) return null;
  return Array.isArray(value) ? value : String(value).split(',').map((v) => v.trim()).filter(Boolean);
}

function toIntList(value) {
  if (value == null) return null;
  const list = Array.isArray(value) ? value : String(value).split(',').map((v) => v.trim()).filter(Boolean);
  return list.map(Number).filter((n) => !Number.isNaN(n));
}

async function loadPromotionProductIds(promotionId) {
  const { rows } = await pool.query('SELECT product_id FROM promotion_products WHERE promotion_id = $1', [promotionId]);
  return rows.map((r) => r.product_id);
}

async function setPromotionProducts(client, promotionId, productIds) {
  await client.query('DELETE FROM promotion_products WHERE promotion_id = $1', [promotionId]);
  for (const productId of productIds || []) {
    await client.query('INSERT INTO promotion_products (promotion_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [promotionId, productId]);
  }
}

// All promotions for staff management. Staff/admin only.
router.get('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM promotions ORDER BY created_at DESC');
  const withProducts = await Promise.all(rows.map(async (p) => ({ ...p, product_ids: await loadPromotionProductIds(p.id) })));
  res.json(withProducts);
}));

router.post('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const {
    name, description, image_url, type, discount_value, buy_quantity, get_quantity, get_discount_percent,
    start_date, end_date, eligible_categories, eligible_brands, excluded_product_ids, min_quantity,
    visible_to_patients, send_push_notification, active, product_ids,
  } = req.body;

  if (!name || !TYPES.includes(type)) {
    return res.status(400).json({ error: `name is required and type must be one of ${TYPES.join(', ')}` });
  }
  if (type === 'bogo' && (!buy_quantity || !get_quantity)) {
    return res.status(400).json({ error: 'buy_quantity and get_quantity are required for a bogo promotion' });
  }
  if (type !== 'bogo' && discount_value == null) {
    return res.status(400).json({ error: 'discount_value is required for this promotion type' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO promotions (
         name, description, image_url, type, discount_value, buy_quantity, get_quantity, get_discount_percent,
         start_date, end_date, eligible_categories, eligible_brands, excluded_product_ids, min_quantity,
         visible_to_patients, send_push_notification, active, created_by_staff_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [
        name, description || null, image_url || null, type,
        type === 'bogo' ? null : Number(discount_value),
        type === 'bogo' ? Number(buy_quantity) : null,
        type === 'bogo' ? Number(get_quantity) : null,
        type === 'bogo' ? Number(get_discount_percent ?? 100) : null,
        start_date || null, end_date || null,
        toList(eligible_categories), toList(eligible_brands), toIntList(excluded_product_ids),
        min_quantity == null || min_quantity === '' ? 1 : Number(min_quantity),
        visible_to_patients ?? true, send_push_notification ?? false, active ?? true, req.user.id,
      ]
    );
    const promotion = rows[0];
    await setPromotionProducts(client, promotion.id, toIntList(product_ids) || []);
    await client.query('COMMIT');
    res.status(201).json({ ...promotion, product_ids: toIntList(product_ids) || [] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.patch('/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    name, description, image_url, type, discount_value, buy_quantity, get_quantity, get_discount_percent,
    start_date, end_date, eligible_categories, eligible_brands, excluded_product_ids, min_quantity,
    visible_to_patients, send_push_notification, active, product_ids,
  } = req.body;
  if (type && !TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of ${TYPES.join(', ')}` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE promotions SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         image_url = COALESCE($3, image_url),
         type = COALESCE($4, type),
         discount_value = COALESCE($5, discount_value),
         buy_quantity = COALESCE($6, buy_quantity),
         get_quantity = COALESCE($7, get_quantity),
         get_discount_percent = COALESCE($8, get_discount_percent),
         start_date = COALESCE($9, start_date),
         end_date = COALESCE($10, end_date),
         eligible_categories = COALESCE($11, eligible_categories),
         eligible_brands = COALESCE($12, eligible_brands),
         excluded_product_ids = COALESCE($13, excluded_product_ids),
         min_quantity = COALESCE($14, min_quantity),
         visible_to_patients = COALESCE($15, visible_to_patients),
         send_push_notification = COALESCE($16, send_push_notification),
         active = COALESCE($17, active),
         updated_at = now()
       WHERE id = $18 RETURNING *`,
      [
        name || null, description ?? null, image_url ?? null, type || null,
        discount_value ?? null, buy_quantity ?? null, get_quantity ?? null, get_discount_percent ?? null,
        start_date ?? null, end_date ?? null, toList(eligible_categories), toList(eligible_brands), toIntList(excluded_product_ids),
        min_quantity ?? null, visible_to_patients ?? null, send_push_notification ?? null, active ?? null, id,
      ]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Promotion not found' });
    }
    if (product_ids !== undefined) {
      await setPromotionProducts(client, id, toIntList(product_ids) || []);
    }
    await client.query('COMMIT');
    res.json({ ...rows[0], product_ids: await loadPromotionProductIds(id) });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.delete('/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM promotions WHERE id = $1', [id]);
  res.status(204).end();
}));

// Preview what publishing would send -- recipient count and the message
// text -- without sending anything. Staff/admin only.
router.get('/:id/publish-preview', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query('SELECT * FROM promotions WHERE id = $1', [id]);
  const promotion = rows[0];
  if (!promotion) {
    return res.status(404).json({ error: 'Promotion not found' });
  }

  const { rows: recipientRows } = await pool.query('SELECT COUNT(*) AS n FROM patients WHERE push_subscription IS NOT NULL');
  res.json({
    title: promotion.name,
    body: promotion.description || `Check out our latest offer: ${promotion.name}`,
    recipient_count: Number(recipientRows[0].n),
    push_configured: pushConfigured(),
    already_sent: promotion.notified_at != null,
  });
}));

// Actually sends the promotion push notification to every patient with
// notifications enabled. Requires an explicit confirm=true -- this is the
// "confirmation" half of the preview/confirm flow the spec calls for, and
// notified_at makes it a no-op on a second accidental click.
router.post('/:id/publish', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (req.body.confirm !== true) {
    return res.status(400).json({ error: 'confirm must be true to send' });
  }

  const { rows } = await pool.query('SELECT * FROM promotions WHERE id = $1', [id]);
  const promotion = rows[0];
  if (!promotion) {
    return res.status(404).json({ error: 'Promotion not found' });
  }
  if (promotion.notified_at) {
    return res.status(409).json({ error: 'This promotion has already been sent' });
  }

  let sent = 0;
  if (pushConfigured()) {
    const { rows: patients } = await pool.query('SELECT id, push_subscription FROM patients WHERE push_subscription IS NOT NULL');
    const body = promotion.description || `Check out our latest offer: ${promotion.name}`;
    for (const patient of patients) {
      const result = await sendPush(patient.push_subscription, { title: promotion.name, body, url: '/patient/shop' });
      if (result.ok) sent += 1;
      else if (result.statusCode === 410 || result.statusCode === 404) {
        await pool.query('UPDATE patients SET push_subscription = NULL WHERE id = $1', [patient.id]);
      }
    }
  }

  const { rows: updated } = await pool.query(
    'UPDATE promotions SET notified_at = now() WHERE id = $1 RETURNING *',
    [id]
  );
  res.json({ ...updated[0], sent_count: sent });
}));

module.exports = router;

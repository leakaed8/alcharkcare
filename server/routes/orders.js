const express = require('express');
const pool = require('../db/pool');
const { verifyToken, requireRole } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { notifyStaffOfNewOrder } = require('../lib/orderNotify');
const { pushToPatientById } = require('../lib/pushNotify');
const { attachPricing } = require('../lib/pricingLookup');
const { computeCartLineTotal } = require('../lib/pricingEngine');

const router = express.Router();

// One line per status a patient should actually hear about. 'pending' is
// the order's own starting state, never a value staff transition *into*,
// so it has no message here.
const ORDER_STATUS_MESSAGES = {
  confirmed: "Your order has been confirmed -- we'll have it ready soon.",
  fulfilled: 'Your order is ready and has been marked as picked up.',
  cancelled: 'Your order was cancelled. Contact us if that seems wrong.',
};

// Kept from the original schema design (001_init.sql) rather than inventing
// a new vocabulary.
const VALID_STATUSES = ['pending', 'confirmed', 'fulfilled', 'cancelled'];

function resolvePatientId(req) {
  if (req.user.role === 'patient') return req.user.id;
  const id = req.body.patient_id;
  return id ? Number(id) : null;
}

function canView(req, patientId) {
  const isStaff = req.user.role === 'staff' || req.user.role === 'admin';
  return isStaff || String(req.user.id) === String(patientId);
}

async function loadOrderWithItems(orderId) {
  const { rows: orderRows } = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (orderRows.length === 0) return null;
  const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
  return { ...orderRows[0], items };
}

// Place an order -- this IS the submitted cart. No online payment: the
// patient pays in store when they pick it up (payment_method =
// cash_on_pickup). Staff/admin can place one on behalf of a patient (e.g.
// over the phone); a patient can only place their own.
router.post('/', verifyToken, asyncHandler(async (req, res) => {
  const patientId = resolvePatientId(req);
  if (!patientId) {
    return res.status(400).json({ error: 'patient_id is required' });
  }
  if (!canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const items = (req.body.items || []).filter((i) => i.product_id && Number(i.quantity) > 0);
  if (items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  const productIds = items.map((i) => Number(i.product_id));
  const { rows: rawProducts } = await pool.query(
    'SELECT id, name, price, category, brand, stock_qty, is_active FROM products WHERE id = ANY($1::int[])',
    [productIds]
  );

  const unavailable = items.filter((i) => !rawProducts.find((p) => p.id === Number(i.product_id))?.is_active);
  if (unavailable.length > 0) {
    return res.status(400).json({ error: 'One or more items are no longer available', unavailable: unavailable.map((i) => i.product_id) });
  }

  // Same pricing engine every product-returning endpoint uses -- the total
  // charged at checkout is computed the same way the cart displayed it,
  // per item quantity (so a promotion's min_quantity/BOGO math sees the
  // real quantity being purchased, not the default of 1).
  const quantities = new Map(items.map((i) => [Number(i.product_id), Number(i.quantity)]));
  const pricedProducts = await attachPricing(rawProducts, quantities);
  const byId = new Map(pricedProducts.map((p) => [p.id, p]));

  const lineTotals = new Map();
  const total = items.reduce((sum, i) => {
    const product = byId.get(Number(i.product_id));
    const { line_total } = computeCartLineTotal({
      unitPrice: product.pricing.unit_price,
      quantity: Number(i.quantity),
      bogoPromotion: product.pricing.bogo_promotion,
    });
    lineTotals.set(Number(i.product_id), line_total);
    return sum + line_total;
  }, 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      `INSERT INTO orders (patient_id, notes, payment_method, total) VALUES ($1, $2, 'cash_on_pickup', $3) RETURNING *`,
      [patientId, req.body.notes || null, total]
    );
    const order = orderResult.rows[0];

    for (const item of items) {
      const product = byId.get(Number(item.product_id));
      const quantity = Number(item.quantity);
      // The effective per-unit price actually charged for this line
      // (line_total / quantity) -- for a BOGO line this is the blended
      // average across paid + free/discounted units, so unit_price *
      // quantity always reconciles with what was charged.
      const effectiveUnitPrice = Math.round((lineTotals.get(Number(item.product_id)) / quantity) * 100) / 100;
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, product.id, product.name, quantity, effectiveUnitPrice]
      );
    }
    await client.query('COMMIT');

    const { rows: patientRows } = await pool.query('SELECT name FROM patients WHERE id = $1', [patientId]);
    notifyStaffOfNewOrder({ id: order.id, item_count: items.length }, patientRows[0]?.name || 'a patient')
      .catch((err) => console.error('Order notify error:', err.message));

    const full = await loadOrderWithItems(order.id);
    res.status(201).json(full);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// Cart pricing preview -- runs the exact same pricing engine calls
// checkout uses, so the cart the patient sees before placing an order
// always matches what they'd actually be charged. Any signed-in user.
router.post('/cart-preview', verifyToken, asyncHandler(async (req, res) => {
  const items = (req.body.items || []).filter((i) => i.product_id && Number(i.quantity) > 0);
  if (items.length === 0) {
    return res.json({ items: [], total: 0 });
  }

  const productIds = items.map((i) => Number(i.product_id));
  const { rows: rawProducts } = await pool.query(
    'SELECT id, name, price, category, brand, stock_qty, is_active FROM products WHERE id = ANY($1::int[])',
    [productIds]
  );
  const quantities = new Map(items.map((i) => [Number(i.product_id), Number(i.quantity)]));
  const pricedProducts = await attachPricing(rawProducts, quantities);
  const byId = new Map(pricedProducts.map((p) => [p.id, p]));

  let total = 0;
  const lineItems = items.map((i) => {
    const product = byId.get(Number(i.product_id));
    if (!product) return null;
    const quantity = Number(i.quantity);
    const { line_total, free_or_discounted_units } = computeCartLineTotal({
      unitPrice: product.pricing.unit_price,
      quantity,
      bogoPromotion: product.pricing.bogo_promotion,
    });
    total += line_total;
    return {
      product_id: product.id,
      quantity,
      unit_price: product.pricing.unit_price,
      original_price: product.pricing.original_price,
      discount: product.pricing.discount,
      bogo_promotion: product.pricing.bogo_promotion,
      free_or_discounted_units,
      line_total,
    };
  }).filter(Boolean);

  res.json({ items: lineItems, total: Math.round(total * 100) / 100 });
}));

// Pending-orders queue for staff -- same pattern as the follow-up
// dashboard. Optional ?status= filter.
router.get('/', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { status } = req.query;
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` });
  }

  const { rows: orders } = await pool.query(
    `SELECT o.*, p.name AS patient_name, p.phone AS patient_phone
     FROM orders o
     JOIN patients p ON p.id = o.patient_id
     WHERE ($1::text IS NULL OR o.status = $1)
     ORDER BY o.order_date DESC`,
    [status || null]
  );

  const withItems = [];
  for (const order of orders) {
    const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    withItems.push({ ...order, items });
  }
  res.json(withItems);
}));

// A patient's own order history; staff/admin can view any patient's.
router.get('/:patientId', verifyToken, asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  if (!canView(req, patientId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows: orders } = await pool.query(
    'SELECT * FROM orders WHERE patient_id = $1 ORDER BY order_date DESC',
    [patientId]
  );
  const withItems = [];
  for (const order of orders) {
    const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    withItems.push({ ...order, items });
  }
  res.json(withItems);
}));

// Update an order's status. Fulfilling one logs each item into the
// existing `purchases` table (same as a staff-scanned invoice) and
// decrements stock -- so it feeds the same purchase-history and lab
// nutrient-sourcing insight as any other logged purchase, and inventory
// isn't touched until the patient actually walks out with the item.
router.patch('/:id', verifyToken, requireRole('staff', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` });
  }

  const existing = await loadOrderWithItems(id);
  if (!existing) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE orders SET status = $1,
         fulfilled_at = CASE WHEN $1 = 'fulfilled' THEN now() ELSE fulfilled_at END,
         fulfilled_by_staff_id = CASE WHEN $1 = 'fulfilled' THEN $2 ELSE fulfilled_by_staff_id END
       WHERE id = $3 RETURNING *`,
      [status, req.user.id, id]
    );

    if (status === 'fulfilled' && existing.status !== 'fulfilled') {
      for (const item of existing.items) {
        await client.query(
          `INSERT INTO purchases (patient_id, product_id, product_name, logged_by_staff_id)
           VALUES ($1, $2, $3, $4)`,
          [existing.patient_id, item.product_id, item.product_name, req.user.id]
        );
        if (item.product_id) {
          await client.query(
            'UPDATE products SET stock_qty = GREATEST(stock_qty - $1, 0) WHERE id = $2',
            [item.quantity, item.product_id]
          );
        }
      }
    }

    await client.query('COMMIT');

    if (status !== existing.status && ORDER_STATUS_MESSAGES[status]) {
      pushToPatientById(existing.patient_id, {
        title: 'Al Chark',
        body: ORDER_STATUS_MESSAGES[status],
        url: '/patient/shop',
      }).catch((err) => console.error('Order status push error:', err.message));
    }

    const full = await loadOrderWithItems(rows[0].id);
    res.json(full);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// The public half of the VAPID keypair -- safe to expose, needed by the
// browser to create a push subscription. Null if push isn't configured yet.
router.get('/push/vapid-public-key', verifyToken, asyncHandler(async (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
}));

// Store a browser push subscription for the current user (staff or
// patient). Overwrites any previous one for this account.
router.post('/push/subscribe', verifyToken, asyncHandler(async (req, res) => {
  const { subscription } = req.body;
  if (!subscription) {
    return res.status(400).json({ error: 'subscription is required' });
  }
  const table = req.user.role === 'patient' ? 'patients' : 'staff';
  await pool.query(`UPDATE ${table} SET push_subscription = $1 WHERE id = $2`, [JSON.stringify(subscription), req.user.id]);
  res.status(204).end();
}));

router.post('/push/unsubscribe', verifyToken, asyncHandler(async (req, res) => {
  const table = req.user.role === 'patient' ? 'patients' : 'staff';
  await pool.query(`UPDATE ${table} SET push_subscription = NULL WHERE id = $1`, [req.user.id]);
  res.status(204).end();
}));

module.exports = router;

// DB orchestration for the pricing engine -- loads whatever active
// batches/expiration rules/promotions are relevant to a set of products and
// runs pricingEngine.computeUnitPrice for each, so every product-returning
// endpoint (and the cart/checkout) attaches the exact same `pricing` field
// the same way. Same "pure engine + DB runner" split as
// sheetsSyncEngine.js/sheetsSyncRunner.js.
const pool = require('../db/pool');
const { todayInBeirut } = require('./beirutDate');
const { computeUnitPrice } = require('./pricingEngine');

// products: array of rows that at minimum have id, price, category, brand.
// quantities: optional Map<productId, quantity> for cart/checkout, where a
// promotion's min_quantity and a BOGO's cart-line math need the real
// quantity rather than the default of 1.
async function attachPricing(products, quantities) {
  if (!products || products.length === 0) return products || [];
  const today = todayInBeirut();
  const productIds = products.map((p) => p.id);

  const [{ rows: batchRows }, { rows: rules }, { rows: promotions }] = await Promise.all([
    pool.query(
      `SELECT product_id, expiration_date::text AS expiration_date, quantity, status
       FROM batches WHERE product_id = ANY($1::int[]) AND status = 'active' AND quantity > 0`,
      [productIds]
    ),
    pool.query('SELECT * FROM expiration_discount_rules WHERE active = true'),
    pool.query('SELECT * FROM promotions WHERE active = true'),
  ]);

  const batchesByProduct = new Map();
  for (const b of batchRows) {
    if (!batchesByProduct.has(b.product_id)) batchesByProduct.set(b.product_id, []);
    batchesByProduct.get(b.product_id).push(b);
  }

  let promotionProductIdsByPromo = {};
  if (promotions.length > 0) {
    const { rows: joinRows } = await pool.query(
      'SELECT promotion_id, product_id FROM promotion_products WHERE promotion_id = ANY($1::int[])',
      [promotions.map((p) => p.id)]
    );
    promotionProductIdsByPromo = {};
    for (const row of joinRows) {
      if (!promotionProductIdsByPromo[row.promotion_id]) promotionProductIdsByPromo[row.promotion_id] = [];
      promotionProductIdsByPromo[row.promotion_id].push(row.product_id);
    }
  }

  return products.map((product) => ({
    ...product,
    pricing: computeUnitPrice({
      product,
      batches: batchesByProduct.get(product.id) || [],
      expirationRules: rules,
      promotions,
      promotionProductIdsByPromo,
      today,
      quantity: quantities?.get(product.id) ?? 1,
    }),
  }));
}

module.exports = { attachPricing };

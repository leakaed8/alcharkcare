// Pure pricing engine: DATABASE -> [this file] -> API -> UI, same layering
// as labRuleEngine.js. No DB access here -- callers load the relevant
// batches/rules/promotions and pass them in, which keeps this testable
// with plain node:test and keeps every product-returning endpoint (and the
// cart/checkout) computing the SAME price the same way.
//
// Priority system (never stacked -- a product shows exactly one discount,
// or none):
//   1. An active, matching BOGO promotion -- doesn't change the displayed
//      unit price, only the cart-line total once quantity is known.
//   2. Among active, matching percentage/fixed/special_price promotions,
//      whichever yields the LOWEST resulting price.
//   3. Among active, matching expiration discount rules, whichever has the
//      highest discount_percent.
//   4. Whichever of (2) and (3) is cheaper wins. No rule/promotion
//      matching means no discount -- base price.

// today/expirationDate are 'YYYY-MM-DD' strings (see todayInBeirut() callers
// use elsewhere in the app) -- plain date math, no timezone conversion here.
function computeDaysUntilExpiration(expirationDate, today) {
  if (!expirationDate || !today) return null;
  const exp = new Date(`${expirationDate}T00:00:00Z`);
  const now = new Date(`${today}T00:00:00Z`);
  return Math.round((exp.getTime() - now.getTime()) / 86400000);
}

// The soonest-expiring active batch with remaining quantity -- product-level
// pricing looks at this one batch, not a mix of batches.
function selectNearestActiveBatch(batches, today) {
  const candidates = (batches || [])
    .filter((b) => b.status === 'active' && Number(b.quantity) > 0)
    .map((b) => ({ ...b, daysUntilExpiration: computeDaysUntilExpiration(b.expiration_date, today) }))
    .filter((b) => b.daysUntilExpiration != null);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.daysUntilExpiration - b.daysUntilExpiration);
  return candidates[0];
}

function isProductExcluded(excludedProductIds, productId) {
  return (excludedProductIds || []).map(Number).includes(Number(productId));
}

function matchesCategoryOrBrand(eligibleCategories, eligibleBrands, product) {
  const hasFilter = (eligibleCategories && eligibleCategories.length > 0) || (eligibleBrands && eligibleBrands.length > 0);
  if (!hasFilter) return null; // caller decides what "no filter" means
  if (eligibleCategories && eligibleCategories.includes(product.category)) return true;
  if (eligibleBrands && eligibleBrands.includes(product.brand)) return true;
  return false;
}

function ruleAppliesToProduct(rule, product) {
  if (isProductExcluded(rule.excluded_product_ids, product.id)) return false;
  const byFilter = matchesCategoryOrBrand(rule.eligible_categories, rule.eligible_brands, product);
  // An expiration rule with no category/brand targeting at all applies
  // store-wide (staff explicitly set a days/discount tier with no further
  // narrowing) -- but it's still an active, deliberately-created rule, so
  // this isn't the "no rule = no discount" case.
  return byFilter === null ? true : byFilter;
}

function selectBestExpirationDiscount(rules, product, daysUntilExpiration) {
  if (daysUntilExpiration == null) return null;
  const matches = (rules || []).filter(
    (r) => r.active && daysUntilExpiration <= Number(r.days_remaining_max) && ruleAppliesToProduct(r, product)
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => Number(b.discount_percent) - Number(a.discount_percent));
  return matches[0];
}

function isPromotionActive(promotion, today) {
  if (!promotion.active) return false;
  if (promotion.start_date && today < promotion.start_date) return false;
  if (promotion.end_date && today > promotion.end_date) return false;
  return true;
}

// explicitProductIds: product ids joined to this promotion via
// promotion_products (caller looks these up separately, keyed by promotion
// id). A promotion with no category/brand filter AND no explicit product
// list is a deliberately store-wide promotion (e.g. "10% off everything").
function promotionAppliesToProduct(promotion, product, explicitProductIds, quantity) {
  if (isProductExcluded(promotion.excluded_product_ids, product.id)) return false;
  if (Number(quantity || 1) < Number(promotion.min_quantity || 1)) return false;
  if ((explicitProductIds || []).map(Number).includes(Number(product.id))) return true;
  const byFilter = matchesCategoryOrBrand(promotion.eligible_categories, promotion.eligible_brands, product);
  if (byFilter === true) return true;
  if (byFilter === false) return false;
  // No category/brand filter: store-wide only if no explicit product list
  // was configured either (an explicit list with no filter means "these
  // specific products only").
  return !explicitProductIds || explicitProductIds.length === 0;
}

function resultingPrice(promotion, basePrice) {
  const base = Number(basePrice);
  switch (promotion.type) {
    case 'percentage': return base * (1 - Number(promotion.discount_value) / 100);
    case 'fixed': return Math.max(0, base - Number(promotion.discount_value));
    case 'special_price': return Number(promotion.discount_value);
    default: return null; // bogo has no per-unit price effect
  }
}

function selectBestUnitPricePromotion(promotions, product, promotionProductIdsByPromo, today, quantity) {
  const matches = (promotions || []).filter((p) => {
    if (p.type === 'bogo') return false;
    if (!isPromotionActive(p, today)) return false;
    const explicit = (promotionProductIdsByPromo || {})[p.id];
    return promotionAppliesToProduct(p, product, explicit, quantity);
  });
  if (matches.length === 0) return null;
  let best = null;
  let bestPrice = null;
  for (const promo of matches) {
    const price = resultingPrice(promo, product.price);
    if (price == null) continue;
    if (bestPrice == null || price < bestPrice) {
      bestPrice = price;
      best = promo;
    }
  }
  return best ? { promotion: best, price: bestPrice } : null;
}

function selectMatchingBogoPromotion(promotions, product, promotionProductIdsByPromo, today, quantity) {
  const matches = (promotions || []).filter((p) => {
    if (p.type !== 'bogo') return false;
    if (!isPromotionActive(p, today)) return false;
    const explicit = (promotionProductIdsByPromo || {})[p.id];
    return promotionAppliesToProduct(p, product, explicit, quantity);
  });
  return matches[0] || null;
}

// Returns the single, consistent unit price + (if any) the one discount
// that produced it, for use everywhere a product's price is shown
// (staff/patient/shop/cart/checkout). quantity defaults to 1 -- pass the
// actual cart quantity when known so a promotion's min_quantity is honored
// consistently between display and checkout.
function computeUnitPrice({ product, batches, expirationRules, promotions, promotionProductIdsByPromo, today, quantity = 1 }) {
  const basePrice = Number(product.price || 0);
  const nearestBatch = selectNearestActiveBatch(batches, today);
  const daysUntilExpiration = nearestBatch ? nearestBatch.daysUntilExpiration : null;

  const bogo = selectMatchingBogoPromotion(promotions, product, promotionProductIdsByPromo, today, quantity);
  const bestPromo = selectBestUnitPricePromotion(promotions, product, promotionProductIdsByPromo, today, quantity);
  const bestRule = selectBestExpirationDiscount(expirationRules, product, daysUntilExpiration);
  const rulePrice = bestRule ? basePrice * (1 - Number(bestRule.discount_percent) / 100) : null;

  let unitPrice = basePrice;
  let discount = null;

  if (bestPromo && rulePrice != null) {
    if (bestPromo.price <= rulePrice) {
      unitPrice = bestPromo.price;
      discount = { source: 'promotion', promotion_id: bestPromo.promotion.id, label: bestPromo.promotion.name, type: bestPromo.promotion.type };
    } else {
      unitPrice = rulePrice;
      discount = { source: 'expiration', rule_id: bestRule.id, label: bestRule.name, percent_off: Number(bestRule.discount_percent) };
    }
  } else if (bestPromo) {
    unitPrice = bestPromo.price;
    discount = { source: 'promotion', promotion_id: bestPromo.promotion.id, label: bestPromo.promotion.name, type: bestPromo.promotion.type };
  } else if (rulePrice != null) {
    unitPrice = rulePrice;
    discount = { source: 'expiration', rule_id: bestRule.id, label: bestRule.name, percent_off: Number(bestRule.discount_percent) };
  }

  unitPrice = Math.round(unitPrice * 100) / 100;

  return {
    original_price: basePrice,
    unit_price: unitPrice,
    discount,
    days_until_expiration: daysUntilExpiration,
    bogo_promotion: bogo ? { id: bogo.id, name: bogo.name, buy_quantity: bogo.buy_quantity, get_quantity: bogo.get_quantity, get_discount_percent: bogo.get_discount_percent } : null,
  };
}

// Cart-line total for a given quantity, applying the BOGO promotion (if
// any) on top of the already-computed unit price. Only complete
// buy+get groups receive the discount -- a leftover remainder that
// doesn't reach a full group is charged at the full unit price, which is
// what prevents rule-violating quantities (e.g. "buy 2 get 1 free" giving
// a discount to someone who only bought 1).
function computeCartLineTotal({ unitPrice, quantity, bogoPromotion }) {
  const qty = Number(quantity || 0);
  const price = Number(unitPrice || 0);
  if (!bogoPromotion || qty <= 0) {
    return { line_total: Math.round(price * qty * 100) / 100, free_or_discounted_units: 0 };
  }

  const buyQty = Number(bogoPromotion.buy_quantity || 0);
  const getQty = Number(bogoPromotion.get_quantity || 0);
  const discountPercent = Number(bogoPromotion.get_discount_percent ?? 100);
  const groupSize = buyQty + getQty;
  if (groupSize <= 0) {
    return { line_total: Math.round(price * qty * 100) / 100, free_or_discounted_units: 0 };
  }

  const fullGroups = Math.floor(qty / groupSize);
  const remainder = qty % groupSize;

  const groupTotal = fullGroups * (buyQty * price + getQty * price * (1 - discountPercent / 100));
  const remainderTotal = remainder * price; // never partially discounted

  return {
    line_total: Math.round((groupTotal + remainderTotal) * 100) / 100,
    free_or_discounted_units: fullGroups * getQty,
  };
}

module.exports = {
  computeDaysUntilExpiration,
  selectNearestActiveBatch,
  ruleAppliesToProduct,
  selectBestExpirationDiscount,
  isPromotionActive,
  promotionAppliesToProduct,
  resultingPrice,
  computeUnitPrice,
  computeCartLineTotal,
};

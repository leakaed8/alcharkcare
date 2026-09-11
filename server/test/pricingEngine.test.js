const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeDaysUntilExpiration,
  selectNearestActiveBatch,
  selectBestExpirationDiscount,
  isPromotionActive,
  promotionAppliesToProduct,
  computeUnitPrice,
  computeCartLineTotal,
} = require('../lib/pricingEngine');

const TODAY = '2026-09-10';

const sunscreen = { id: 1, name: 'Sunscreen SPF50', category: 'skincare', brand: 'Al Chark', price: 20 };

describe('computeDaysUntilExpiration', () => {
  test('computes whole-day difference', () => {
    assert.equal(computeDaysUntilExpiration('2026-09-20', TODAY), 10);
    assert.equal(computeDaysUntilExpiration('2026-09-01', TODAY), -9);
  });
  test('null when either date missing', () => {
    assert.equal(computeDaysUntilExpiration(null, TODAY), null);
  });
});

describe('selectNearestActiveBatch', () => {
  test('picks soonest-expiring active batch with stock', () => {
    const batches = [
      { status: 'active', quantity: 5, expiration_date: '2026-12-01' },
      { status: 'active', quantity: 3, expiration_date: '2026-09-25' },
      { status: 'expired', quantity: 10, expiration_date: '2026-09-15' },
      { status: 'active', quantity: 0, expiration_date: '2026-09-11' },
    ];
    const nearest = selectNearestActiveBatch(batches, TODAY);
    assert.equal(nearest.expiration_date, '2026-09-25');
  });
  test('null when no eligible batches', () => {
    assert.equal(selectNearestActiveBatch([], TODAY), null);
    assert.equal(selectNearestActiveBatch(null, TODAY), null);
  });
});

describe('selectBestExpirationDiscount', () => {
  const rules = [
    { id: 1, active: true, days_remaining_max: 30, discount_percent: 15, eligible_categories: null, eligible_brands: null, excluded_product_ids: null },
    { id: 2, active: true, days_remaining_max: 7, discount_percent: 40, eligible_categories: null, eligible_brands: null, excluded_product_ids: null },
    { id: 3, active: false, days_remaining_max: 30, discount_percent: 99, eligible_categories: null, eligible_brands: null, excluded_product_ids: null },
  ];
  test('picks the highest discount among qualifying tiers', () => {
    const best = selectBestExpirationDiscount(rules, sunscreen, 5);
    assert.equal(best.id, 2);
  });
  test('inactive rules are never selected', () => {
    const best = selectBestExpirationDiscount(rules, sunscreen, 5);
    assert.notEqual(best.id, 3);
  });
  test('no discount when days remaining exceeds every tier', () => {
    assert.equal(selectBestExpirationDiscount(rules, sunscreen, 90), null);
  });
  test('no discount when daysUntilExpiration is null (no batch)', () => {
    assert.equal(selectBestExpirationDiscount(rules, sunscreen, null), null);
  });
  test('excluded product never gets the discount', () => {
    const excludingRules = [{ id: 4, active: true, days_remaining_max: 30, discount_percent: 50, excluded_product_ids: [1] }];
    assert.equal(selectBestExpirationDiscount(excludingRules, sunscreen, 5), null);
  });
  test('category/brand targeting narrows eligibility', () => {
    const targeted = [{ id: 5, active: true, days_remaining_max: 30, discount_percent: 20, eligible_categories: ['haircare'] }];
    assert.equal(selectBestExpirationDiscount(targeted, sunscreen, 5), null);
    const matching = [{ id: 6, active: true, days_remaining_max: 30, discount_percent: 20, eligible_categories: ['skincare'] }];
    assert.equal(selectBestExpirationDiscount(matching, sunscreen, 5).id, 6);
  });
});

describe('isPromotionActive / promotionAppliesToProduct', () => {
  test('respects date window', () => {
    const promo = { active: true, start_date: '2026-09-01', end_date: '2026-09-30' };
    assert.equal(isPromotionActive(promo, TODAY), true);
    assert.equal(isPromotionActive({ ...promo, start_date: '2026-10-01' }, TODAY), false);
    assert.equal(isPromotionActive({ ...promo, end_date: '2026-09-01' }, TODAY), false);
  });
  test('store-wide promotion applies with no targeting configured', () => {
    const promo = { eligible_categories: null, eligible_brands: null, excluded_product_ids: null, min_quantity: 1 };
    assert.equal(promotionAppliesToProduct(promo, sunscreen, [], 1), true);
  });
  test('min_quantity gates eligibility', () => {
    const promo = { eligible_categories: null, eligible_brands: null, min_quantity: 2 };
    assert.equal(promotionAppliesToProduct(promo, sunscreen, [], 1), false);
    assert.equal(promotionAppliesToProduct(promo, sunscreen, [], 2), true);
  });
  test('explicit product list wins over category filter', () => {
    const promo = { eligible_categories: ['haircare'], min_quantity: 1 };
    assert.equal(promotionAppliesToProduct(promo, sunscreen, [1], 1), true);
  });
});

describe('computeUnitPrice', () => {
  test('no rules or promotions -> base price, no discount', () => {
    const result = computeUnitPrice({ product: sunscreen, batches: [], expirationRules: [], promotions: [], promotionProductIdsByPromo: {}, today: TODAY });
    assert.equal(result.unit_price, 20);
    assert.equal(result.discount, null);
  });

  test('expiration rule alone applies', () => {
    const batches = [{ status: 'active', quantity: 5, expiration_date: '2026-09-15' }];
    const expirationRules = [{ id: 1, active: true, days_remaining_max: 30, discount_percent: 25 }];
    const result = computeUnitPrice({ product: sunscreen, batches, expirationRules, promotions: [], promotionProductIdsByPromo: {}, today: TODAY });
    assert.equal(result.unit_price, 15);
    assert.equal(result.discount.source, 'expiration');
  });

  test('promotion alone applies', () => {
    const promotions = [{ id: 9, type: 'percentage', discount_value: 10, active: true, min_quantity: 1, name: 'Fall sale' }];
    const result = computeUnitPrice({ product: sunscreen, batches: [], expirationRules: [], promotions, promotionProductIdsByPromo: {}, today: TODAY });
    assert.equal(result.unit_price, 18);
    assert.equal(result.discount.source, 'promotion');
  });

  test('never stacks -- picks whichever gives the lower price', () => {
    const batches = [{ status: 'active', quantity: 5, expiration_date: '2026-09-15' }];
    const expirationRules = [{ id: 1, active: true, days_remaining_max: 30, discount_percent: 50 }]; // -> 10
    const promotions = [{ id: 9, type: 'percentage', discount_value: 10, active: true, min_quantity: 1, name: 'Fall sale' }]; // -> 18
    const result = computeUnitPrice({ product: sunscreen, batches, expirationRules, promotions, promotionProductIdsByPromo: {}, today: TODAY });
    assert.equal(result.unit_price, 10);
    assert.equal(result.discount.source, 'expiration');
  });

  test('special_price and fixed types resolve correctly', () => {
    const specialPromo = [{ id: 1, type: 'special_price', discount_value: 12.5, active: true, min_quantity: 1, name: 'Special' }];
    assert.equal(computeUnitPrice({ product: sunscreen, batches: [], expirationRules: [], promotions: specialPromo, promotionProductIdsByPromo: {}, today: TODAY }).unit_price, 12.5);

    const fixedPromo = [{ id: 2, type: 'fixed', discount_value: 5, active: true, min_quantity: 1, name: '$5 off' }];
    assert.equal(computeUnitPrice({ product: sunscreen, batches: [], expirationRules: [], promotions: fixedPromo, promotionProductIdsByPromo: {}, today: TODAY }).unit_price, 15);
  });

  test('bogo promotion is surfaced but does not change unit price', () => {
    const bogo = [{ id: 3, type: 'bogo', buy_quantity: 2, get_quantity: 1, get_discount_percent: 100, active: true, min_quantity: 1, name: 'Buy 2 get 1 free' }];
    const result = computeUnitPrice({ product: sunscreen, batches: [], expirationRules: [], promotions: bogo, promotionProductIdsByPromo: {}, today: TODAY });
    assert.equal(result.unit_price, 20);
    assert.equal(result.discount, null);
    assert.equal(result.bogo_promotion.id, 3);
  });
});

describe('computeCartLineTotal', () => {
  test('no bogo -> simple multiplication', () => {
    assert.deepEqual(computeCartLineTotal({ unitPrice: 20, quantity: 3, bogoPromotion: null }), { line_total: 60, free_or_discounted_units: 0 });
  });

  test('buy 2 get 1 free: full groups discounted, remainder charged in full', () => {
    const bogo = { buy_quantity: 2, get_quantity: 1, get_discount_percent: 100 };
    // qty 3 = exactly one group -> 2 paid + 1 free = 40
    assert.deepEqual(computeCartLineTotal({ unitPrice: 20, quantity: 3, bogoPromotion: bogo }), { line_total: 40, free_or_discounted_units: 1 });
    // qty 2 -> incomplete group, no discount at all (prevents rule-violating quantities)
    assert.deepEqual(computeCartLineTotal({ unitPrice: 20, quantity: 2, bogoPromotion: bogo }), { line_total: 40, free_or_discounted_units: 0 });
    // qty 5 -> one full group (3) + remainder of 2 at full price
    assert.deepEqual(computeCartLineTotal({ unitPrice: 20, quantity: 5, bogoPromotion: bogo }), { line_total: 40 + 40, free_or_discounted_units: 1 });
  });

  test('partial-percentage bogo (e.g. 50% off the get item)', () => {
    const bogo = { buy_quantity: 1, get_quantity: 1, get_discount_percent: 50 };
    // qty 2 = one group: 1 full + 1 half price = 30
    assert.deepEqual(computeCartLineTotal({ unitPrice: 20, quantity: 2, bogoPromotion: bogo }), { line_total: 30, free_or_discounted_units: 1 });
  });
});

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { findDueCheckin, daysBetween } = require('../lib/checkinEngine');

const day1All = { id: 1, active: true, day_offset: 1, target_scope: 'all' };
const day3All = { id: 2, active: true, day_offset: 3, target_scope: 'all' };
const day7All = { id: 3, active: true, day_offset: 7, target_scope: 'all' };
const productQ = { id: 4, active: true, day_offset: 2, target_scope: 'product', target_product_id: 99 };
const categoryQ = { id: 5, active: true, day_offset: 2, target_scope: 'category', target_category: 'skincare' };

describe('daysBetween', () => {
  test('counts whole UTC days', () => {
    assert.equal(daysBetween('2026-01-01', '2026-01-08'), 7);
    assert.equal(daysBetween('2026-01-01', '2026-01-01'), 0);
  });
});

describe('findDueCheckin: basic day-offset matching', () => {
  const activeItems = [{ visit_product_id: 10, product_id: 1, category: 'supplement', started_date: '2026-01-01' }];

  test('not yet due before the offset', () => {
    const result = findDueCheckin({
      questions: [day3All], activeItems, answeredKeys: new Set(), today: '2026-01-02', checkinsThisWeek: 0, maxPerWeek: 2,
    });
    assert.equal(result, null);
  });

  test('due exactly on the offset day', () => {
    const result = findDueCheckin({
      questions: [day3All], activeItems, answeredKeys: new Set(), today: '2026-01-04', checkinsThisWeek: 0, maxPerWeek: 2,
    });
    assert.equal(result.question.id, 2);
    assert.equal(result.visitProductId, null);
  });

  test('still due (overdue) after the offset day if unanswered', () => {
    const result = findDueCheckin({
      questions: [day3All], activeItems, answeredKeys: new Set(), today: '2026-01-10', checkinsThisWeek: 0, maxPerWeek: 2,
    });
    assert.equal(result.question.id, 2);
  });

  test('already-answered question is never surfaced again', () => {
    const result = findDueCheckin({
      questions: [day3All], activeItems, answeredKeys: new Set(['2:all']), today: '2026-01-10', checkinsThisWeek: 0, maxPerWeek: 2,
    });
    assert.equal(result, null);
  });
});

describe('findDueCheckin: only one question surfaced at a time, most overdue wins', () => {
  test('day1 and day3 both overdue -> the more overdue one (day1) is returned', () => {
    const activeItems = [{ visit_product_id: 10, product_id: 1, category: 'supplement', started_date: '2026-01-01' }];
    const result = findDueCheckin({
      questions: [day1All, day3All], activeItems, answeredKeys: new Set(), today: '2026-01-10', checkinsThisWeek: 0, maxPerWeek: 5,
    });
    assert.equal(result.question.id, 1);
  });

  test('equally overdue -> the earlier-scheduled question wins', () => {
    const activeItems = [{ visit_product_id: 10, product_id: 1, category: 'supplement', started_date: '2026-01-01' }];
    const result = findDueCheckin({
      questions: [day7All, day3All], activeItems, answeredKeys: new Set(), today: '2026-01-04', checkinsThisWeek: 0, maxPerWeek: 5,
    });
    assert.equal(result.question.id, 2); // day3All, not yet time for day7All anyway
  });
});

describe('findDueCheckin: frequency cap', () => {
  test('at the weekly cap -> nothing surfaced even if due', () => {
    const activeItems = [{ visit_product_id: 10, product_id: 1, category: 'supplement', started_date: '2026-01-01' }];
    const result = findDueCheckin({
      questions: [day1All], activeItems, answeredKeys: new Set(), today: '2026-01-05', checkinsThisWeek: 2, maxPerWeek: 2,
    });
    assert.equal(result, null);
  });

  test('under the cap -> surfaced normally', () => {
    const activeItems = [{ visit_product_id: 10, product_id: 1, category: 'supplement', started_date: '2026-01-01' }];
    const result = findDueCheckin({
      questions: [day1All], activeItems, answeredKeys: new Set(), today: '2026-01-05', checkinsThisWeek: 1, maxPerWeek: 2,
    });
    assert.ok(result);
  });
});

describe('findDueCheckin: no active routine items', () => {
  test('nothing surfaced when the patient has no started items', () => {
    const result = findDueCheckin({
      questions: [day1All], activeItems: [], answeredKeys: new Set(), today: '2026-01-05', checkinsThisWeek: 0, maxPerWeek: 2,
    });
    assert.equal(result, null);
  });
});

describe('findDueCheckin: product- and category-scoped questions', () => {
  test('product-scoped question only matches its target product', () => {
    const activeItems = [
      { visit_product_id: 1, product_id: 99, category: 'supplement', started_date: '2026-01-01' },
      { visit_product_id: 2, product_id: 5, category: 'skincare', started_date: '2026-01-01' },
    ];
    const result = findDueCheckin({
      questions: [productQ], activeItems, answeredKeys: new Set(), today: '2026-01-05', checkinsThisWeek: 0, maxPerWeek: 5,
    });
    assert.equal(result.visitProductId, 1);
  });

  test('category-scoped question matches any item in that category', () => {
    const activeItems = [
      { visit_product_id: 1, product_id: 99, category: 'supplement', started_date: '2026-01-01' },
      { visit_product_id: 2, product_id: 5, category: 'skincare', started_date: '2026-01-01' },
    ];
    const result = findDueCheckin({
      questions: [categoryQ], activeItems, answeredKeys: new Set(), today: '2026-01-05', checkinsThisWeek: 0, maxPerWeek: 5,
    });
    assert.equal(result.visitProductId, 2);
  });

  test('product-scoped question answered for one item does not block a different item of the same product elsewhere', () => {
    const activeItems = [
      { visit_product_id: 1, product_id: 99, category: 'supplement', started_date: '2026-01-01' },
      { visit_product_id: 3, product_id: 99, category: 'supplement', started_date: '2026-01-02' },
    ];
    const result = findDueCheckin({
      questions: [productQ], activeItems, answeredKeys: new Set(['4:1']), today: '2026-01-05', checkinsThisWeek: 0, maxPerWeek: 5,
    });
    assert.equal(result.visitProductId, 3);
  });
});

describe('findDueCheckin: inactive questions are ignored', () => {
  test('a disabled question is never surfaced', () => {
    const activeItems = [{ visit_product_id: 10, product_id: 1, category: 'supplement', started_date: '2026-01-01' }];
    const result = findDueCheckin({
      questions: [{ ...day1All, active: false }], activeItems, answeredKeys: new Set(), today: '2026-01-05', checkinsThisWeek: 0, maxPerWeek: 5,
    });
    assert.equal(result, null);
  });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { mapSheetRows, computeRowHash, diffProductRow } = require('../lib/sheetsSyncEngine');

test('mapSheetRows', async (t) => {
  await t.test('matches known headers and coerces field types', () => {
    const values = [
      ['Product Name', 'SKU', 'Price', 'Stock', 'Allergens', 'Some Unknown Column'],
      ['Vitamin D', 'VD-100', '9.5', '20', 'nuts, soy', 'ignored'],
    ];
    const { rows, unmatchedHeaders } = mapSheetRows(values);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Vitamin D');
    assert.equal(rows[0].sku, 'VD-100');
    assert.equal(rows[0].price, 9.5);
    assert.equal(rows[0].stock_qty, 20);
    assert.deepEqual(rows[0].allergens, ['nuts', 'soy']);
    assert.deepEqual(unmatchedHeaders, ['Some Unknown Column']);
  });

  await t.test('a row with no values in any matched column is skipped', () => {
    const values = [
      ['Product Name', 'SKU'],
      ['', ''],
      ['Real Product', 'RP-1'],
    ];
    const { rows } = mapSheetRows(values);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Real Product');
  });

  await t.test('row numbers account for the header row', () => {
    const values = [
      ['Product Name'],
      ['First'],
      ['Second'],
    ];
    const { rows } = mapSheetRows(values);
    assert.equal(rows[0]._row, 2);
    assert.equal(rows[1]._row, 3);
  });

  await t.test('empty sheet produces no rows', () => {
    assert.deepEqual(mapSheetRows([]), { rows: [], unmatchedHeaders: [] });
  });
});

test('computeRowHash', async (t) => {
  await t.test('identical rows hash the same', () => {
    assert.equal(computeRowHash(['a', '1']), computeRowHash(['a', '1']));
  });

  await t.test('a changed cell changes the hash', () => {
    assert.notEqual(computeRowHash(['a', '1']), computeRowHash(['a', '2']));
  });
});

test('diffProductRow', async (t) => {
  await t.test('a brand-new product applies every incoming field with no conflicts', () => {
    const { changes, conflicts, isNew } = diffProductRow({
      existingProduct: null,
      incoming: { name: 'New Product', price: 10, stock_qty: 5 },
    });
    assert.equal(isNew, true);
    assert.deepEqual(changes, { name: 'New Product', price: 10, stock_qty: 5 });
    assert.deepEqual(conflicts, []);
  });

  await t.test('a never-synced existing product applies differing fields directly, even if recently edited', () => {
    const { changes, conflicts } = diffProductRow({
      existingProduct: { name: 'Old Name', price: 10, updated_at: new Date(), last_synced_at: null },
      incoming: { name: 'Sheet Name', price: 10 },
    });
    assert.deepEqual(changes, { name: 'Sheet Name' });
    assert.deepEqual(conflicts, []);
  });

  await t.test('a product untouched since its last sync applies differing fields directly', () => {
    const lastSynced = new Date('2026-01-01');
    const { changes, conflicts } = diffProductRow({
      existingProduct: { name: 'Old Name', updated_at: new Date('2025-12-01'), last_synced_at: lastSynced },
      incoming: { name: 'Sheet Name' },
    });
    assert.deepEqual(changes, { name: 'Sheet Name' });
    assert.deepEqual(conflicts, []);
  });

  await t.test('a product edited in-app since its last sync flags a conflict instead of applying', () => {
    const lastSynced = new Date('2026-01-01');
    const { changes, conflicts } = diffProductRow({
      existingProduct: { name: 'Staff Edited Name', updated_at: new Date('2026-02-01'), last_synced_at: lastSynced },
      incoming: { name: 'Sheet Name' },
    });
    assert.deepEqual(changes, {});
    assert.deepEqual(conflicts, [{ field: 'name', appValue: 'Staff Edited Name', sheetValue: 'Sheet Name' }]);
  });

  await t.test('equal values never become a change or a conflict', () => {
    const { changes, conflicts } = diffProductRow({
      existingProduct: { name: 'Same', price: 10, updated_at: new Date(), last_synced_at: new Date('2020-01-01') },
      incoming: { name: 'Same', price: 10 },
    });
    assert.deepEqual(changes, {});
    assert.deepEqual(conflicts, []);
  });

  await t.test('a field the sheet does not carry at all is left untouched, not cleared', () => {
    const { changes, conflicts } = diffProductRow({
      existingProduct: { name: 'Keep Me', description: 'Existing description', updated_at: new Date(), last_synced_at: new Date('2020-01-01') },
      incoming: { name: 'Keep Me' },
    });
    assert.deepEqual(changes, {});
    assert.deepEqual(conflicts, []);
  });

  await t.test('array fields compare by contents, not identity', () => {
    const r1 = diffProductRow({
      existingProduct: { allergens: ['nuts', 'soy'], updated_at: new Date('2019-01-01'), last_synced_at: new Date('2020-01-01') },
      incoming: { allergens: ['nuts', 'soy'] },
    });
    assert.deepEqual(r1.changes, {});

    const r2 = diffProductRow({
      existingProduct: { allergens: ['nuts'], updated_at: new Date('2019-01-01'), last_synced_at: new Date('2020-01-01') },
      incoming: { allergens: ['nuts', 'soy'] },
    });
    assert.deepEqual(r2.changes, { allergens: ['nuts', 'soy'] });
  });
});

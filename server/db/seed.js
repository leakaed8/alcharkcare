// Seeds one test staff account, one test patient, and a couple of test
// products so the login flow and staff screens have something to show.
// Safe to re-run: uses ON CONFLICT to skip rows that already exist.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function seed() {
  const staffPasswordHash = await bcrypt.hash('staff123', 10);
  const patientPinHash = await bcrypt.hash('1234', 10);

  await pool.query(
    `INSERT INTO staff (name, username, password_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (username) DO NOTHING`,
    ['Test Staff', 'staff', staffPasswordHash, 'admin']
  );

  await pool.query(
    `INSERT INTO patients (name, phone, pin_hash, dob, skin_type)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (phone) DO NOTHING`,
    ['Test Patient', '+96170123456', patientPinHash, '1990-01-01', 'combination']
  );

  await pool.query(
    `INSERT INTO products (name, category, sku, price, stock_qty, duration_days)
     VALUES
       ('Gentle Cleanser', 'skincare', 'SKU-001', 12.5, 50, 60),
       ('Vitamin D Supplement', 'supplement', 'SKU-002', 8.0, 100, 30)
     ON CONFLICT (sku) DO NOTHING`
  );

  const vitaminD = await pool.query(`SELECT id FROM products WHERE sku = 'SKU-002'`);
  if (vitaminD.rows[0]) {
    await pool.query(
      `INSERT INTO product_nutrients (product_id, nutrient_key, amount, unit)
       SELECT $1, 'vitamin_d', 1000, 'IU'
       WHERE NOT EXISTS (
         SELECT 1 FROM product_nutrients WHERE product_id = $1 AND nutrient_key = 'vitamin_d'
       )`,
      [vitaminD.rows[0].id]
    );
  }

  const defaultTestTypes = [
    ['vitamin_d', 'Vitamin D (25-OH)', 'ng/mL', 30, 100, ['vitamin d', '25-oh vitamin d', '25(oh)d', 'vit d', 'vitamin d3']],
    ['vitamin_b12', 'Vitamin B12', 'pg/mL', 200, 900, ['vitamin b12', 'vit b12', 'b12', 'cobalamin']],
    ['ferritin', 'Ferritin (iron stores)', 'ng/mL', 20, 250, ['ferritin']],
    ['calcium', 'Calcium', 'mg/dL', 8.5, 10.5, ['calcium']],
    ['magnesium', 'Magnesium', 'mg/dL', 1.7, 2.2, ['magnesium']],
    ['folate', 'Folate', 'ng/mL', 3, 20, ['folate', 'folic acid']],
    ['zinc', 'Zinc', 'mcg/dL', 60, 120, ['zinc']],
    ['vitamin_c', 'Vitamin C', 'mg/L', 4, 20, ['vitamin c', 'ascorbic acid']],
  ];
  for (const [key, label, unit, refLow, refHigh, aliases] of defaultTestTypes) {
    await pool.query(
      `INSERT INTO lab_test_types (key, label, unit, ref_low, ref_high, aliases)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (key) DO NOTHING`,
      [key, label, unit, refLow, refHigh, aliases]
    );
  }

  console.log('Seed complete. Staff login: staff / staff123. Patient login: +96170123456 / 1234');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

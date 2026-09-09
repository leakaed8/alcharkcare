-- Patient-facing catalog + order-ahead cart/checkout. `orders`/`order_items`
-- were already scaffolded in 001_init.sql (never wired to a route) --
-- extend them rather than creating a competing pair of tables. Keep the
-- existing status vocabulary (pending | confirmed | fulfilled | cancelled)
-- and payment_method vocabulary (cash_on_pickup | bank_transfer | other)
-- that were already designed in; this feature only ever inserts
-- 'cash_on_pickup' (pay in store on pickup, no online payment).

ALTER TABLE products ADD COLUMN IF NOT EXISTS allergens TEXT[]; -- e.g. ['nuts','fragrance'] -- excluded from suggestions when it overlaps a patient's allergies
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true; -- soft-hide discontinued items from the patient-facing catalog without deleting sales history

ALTER TABLE staff ADD COLUMN IF NOT EXISTS push_subscription JSONB; -- mirrors patients.push_subscription, for staff opt-in to browser push on new orders

-- Fulfilling an order writes to the existing `purchases` table (see
-- 002_labs_purchases.sql) so it flows into the same purchase-history and
-- lab/nutrient sourcing-insight logic as a staff-logged purchase.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilled_by_staff_id INTEGER REFERENCES staff(id);

-- Snapshot the product name onto the line item so a later product rename
-- or delete doesn't change what a historical order shows.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_patient_id ON orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

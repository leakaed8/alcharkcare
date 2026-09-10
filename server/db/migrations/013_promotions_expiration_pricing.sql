-- Batch-level expiration tracking, a configurable expiration-discount
-- engine, and promotions (percentage/fixed/special-price/BOGO). Batches are
-- an additional tracking layer -- they do NOT adjust products.stock_qty,
-- which stays the single source of truth for available quantity. Pricing
-- decisions (which discount, if any, applies to a product) are computed at
-- read time by the pricing engine from whichever rules/promotions are
-- active; nothing here auto-discounts a product without a matching rule.

CREATE TABLE IF NOT EXISTS batches (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  batch_number TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  expiration_date DATE NOT NULL,
  cost NUMERIC,
  status TEXT NOT NULL DEFAULT 'active', -- active | expired | discontinued
  created_by_staff_id INTEGER REFERENCES staff(id),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batches_product_id ON batches(product_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiration_date ON batches(expiration_date);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);

-- Staff-configurable discount tiers keyed off "days until expiration" (e.g.
-- "within 30 days -> 20% off"). A product only gets a discount from here if
-- its nearest active batch falls within some active rule's window AND the
-- rule's own category/brand/exclusion targeting matches that product --
-- no rule matching means no automatic discount.
CREATE TABLE IF NOT EXISTS expiration_discount_rules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  days_remaining_max INTEGER NOT NULL, -- applies when days-until-expiration <= this
  discount_percent NUMERIC NOT NULL,
  eligible_categories TEXT[],
  eligible_brands TEXT[],
  excluded_product_ids INTEGER[],
  active BOOLEAN NOT NULL DEFAULT true,
  created_by_staff_id INTEGER REFERENCES staff(id),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expiration_discount_rules_active ON expiration_discount_rules(active);

-- Promotions: percentage/fixed/special_price apply per-unit; bogo applies
-- at cart-line level (buy_quantity, get_quantity, get_discount_percent --
-- 100 = free). Eligibility mirrors the discount rules (category/brand +
-- exclusions) plus an explicit per-product join table (promotion_products)
-- for one-off targeting that isn't category/brand-wide.
CREATE TABLE IF NOT EXISTS promotions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  type TEXT NOT NULL, -- percentage | fixed | special_price | bogo
  discount_value NUMERIC, -- percent off, fixed amount off, or the special price itself, per type
  buy_quantity INTEGER, -- bogo only
  get_quantity INTEGER, -- bogo only
  get_discount_percent NUMERIC, -- bogo only; 100 = free
  start_date DATE,
  end_date DATE,
  eligible_categories TEXT[],
  eligible_brands TEXT[],
  excluded_product_ids INTEGER[],
  min_quantity INTEGER NOT NULL DEFAULT 1,
  target_audience TEXT NOT NULL DEFAULT 'all',
  visible_to_patients BOOLEAN NOT NULL DEFAULT true,
  send_push_notification BOOLEAN NOT NULL DEFAULT false,
  notified_at TIMESTAMP, -- set once the publish notification has actually been sent, so it's never re-sent
  active BOOLEAN NOT NULL DEFAULT true,
  created_by_staff_id INTEGER REFERENCES staff(id),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(active);

CREATE TABLE IF NOT EXISTS promotion_products (
  promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  PRIMARY KEY (promotion_id, product_id)
);

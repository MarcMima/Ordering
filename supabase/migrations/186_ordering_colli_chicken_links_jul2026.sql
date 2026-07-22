-- Ordering colli + chicken recipe links (Jul 2026).
-- Restores case packs, VG crate sizes, and per-location Marinated chicken → Chicken links
-- (migration 180 left only the Amsterdam raw id linked).

-- ─── Marinated chicken → Chicken (all locations that serve the prep) ─────────
INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
SELECT p.id, ri.id, 10000::numeric
FROM prep_items p
JOIN location_prep_items lpi ON lpi.prep_item_id = p.id
JOIN raw_ingredients ri
  ON ri.location_id = lpi.location_id
 AND lower(btrim(ri.name)) = lower(btrim('Chicken'))
WHERE lower(btrim(p.name)) = lower(btrim('Marinated chicken'))
ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    updated_at = NOW();

-- ─── Sugar brown: case of 12 × 600 g (undo 182 single-bag reset) ──────────────
DELETE FROM ingredient_pack_sizes ips
USING raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Sugar brown'));

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 7.2, 'kg', 'both', 'case (12 × 600 g)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Sugar brown'));

-- Keep stocktake per retail bag
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'bag',
  stocktake_content_amount = 600,
  stocktake_content_unit = 'g',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Sugar brown'));

-- ─── Red lentils: case of 10 × 1 kg bags ─────────────────────────────────────
DELETE FROM ingredient_pack_sizes ips
USING raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Red lentils'));

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 10.0, 'kg', 'both', 'case (10 × 1 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Red lentils'));

UPDATE raw_ingredients
SET
  stocktake_unit_label = 'bag',
  stocktake_content_amount = 1,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Red lentils'));

-- ─── Cauliflower: order per box (4 × 2.5 kg = 10 kg) ─────────────────────────
DELETE FROM ingredient_pack_sizes ips
USING raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Cauliflower'))
  AND ips.pack_purpose IN ('order', 'both');

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 10.0, 'kg', 'order', 'box (4 × 2.5 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Cauliflower'))
  AND NOT EXISTS (
    SELECT 1 FROM ingredient_pack_sizes ips
    WHERE ips.raw_ingredient_id = raw_ingredients.id
      AND ips.pack_purpose IN ('order', 'both')
      AND ips.size = 10
      AND ips.size_unit = 'kg'
  );

UPDATE raw_ingredients
SET
  stocktake_unit_label = 'bag',
  stocktake_content_amount = 2.5,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Cauliflower'));

-- ─── Greek yoghurt 10%: case of 6 × 1 kg buckets (not singles) ───────────────
DELETE FROM ingredient_pack_sizes ips
USING raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Greek yoghurt 10%'));

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 6.0, 'kg', 'both', 'case (6 × 1 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Greek yoghurt 10%'));

UPDATE raw_ingredients
SET
  stocktake_unit_label = 'bucket',
  stocktake_content_amount = 1.0,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Greek yoghurt 10%'));

-- ─── Aubergine puree: case of 6 cans (2.83 kg each) ─────────────────────────
DELETE FROM ingredient_pack_sizes ips
USING raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) IN (lower(btrim('Aubergine puree')), lower(btrim('Eggplant puree')));

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 16.98, 'kg', 'both', 'case (6 × 2.83 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) IN (lower(btrim('Aubergine puree')), lower(btrim('Eggplant puree')));

UPDATE raw_ingredients
SET
  stocktake_unit_label = 'can',
  stocktake_content_amount = 2.83,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) IN (lower(btrim('Aubergine puree')), lower(btrim('Eggplant puree')));

-- ─── Red onion sliced fine: order per 3 kg colli (3 × 1 kg bags) ─────────────
DELETE FROM ingredient_pack_sizes ips
USING raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Red onion sliced fine'));

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 3.0, 'kg', 'both', 'case (3 × 1 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Red onion sliced fine'));

UPDATE raw_ingredients
SET
  stocktake_unit_label = 'bag',
  stocktake_content_amount = 1.0,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Red onion sliced fine'));

-- ─── Romaine lettuce: Van Gelder crate of 8 heads (KST8ST) ───────────────────
DELETE FROM ingredient_pack_sizes ips
USING raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Romaine lettuce'));

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, grams_per_piece, order_pack_multiple
)
SELECT id, 8.0, 'pcs', 'both', 'crate (8 pcs)', 500.0, 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Romaine lettuce'));

-- Stocktake stays per head; order unit is the crate
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'piece',
  stocktake_content_amount = 1,
  stocktake_content_unit = 'pcs',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Romaine lettuce'));

-- ─── Honey sticks: ensure weekly-only stocktake flags (idempotent) ───────────
UPDATE raw_ingredients
SET
  order_interval_days = 7,
  stocktake_visible = TRUE,
  stocktake_day_of_week = 1,
  stocktake_unit_label = COALESCE(stocktake_unit_label, 'box'),
  stocktake_content_amount = COALESCE(stocktake_content_amount, 100.0),
  stocktake_content_unit = COALESCE(stocktake_content_unit, 'pcs'),
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Honey sticks'));

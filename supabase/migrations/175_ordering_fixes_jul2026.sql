-- Ordering fixes (Jul 2026): pack sizes, discontinued articles, lavender off, pickled +30%.

-- ─── Bulgur: Bidfood 1 kg bag (art. 152879) ─────────────────────────────────
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'bag',
  stocktake_content_amount = 1,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Bulgur'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Bulgur'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 1.0, 'kg', 'both', 'bag (1 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Bulgur'));

UPDATE supplier_ingredients si
SET
  supplier_sku = '152879ZK',
  ean_code = NULL,
  supplier_article_code = '152879',
  supplier_article_name = 'Bulgur zak 1 kg',
  order_unit = 'ZK',
  is_preferred = TRUE,
  updated_at = NOW()
FROM suppliers s, raw_ingredients ri
WHERE si.supplier_id = s.id
  AND si.raw_ingredient_id = ri.id
  AND lower(btrim(s.name)) = 'bidfood'
  AND lower(btrim(ri.name)) = lower(btrim('Bulgur'));

-- ─── Red lentils: 1 kg bag, Bidfood art. 103946 (replaces discontinued 152891) ─
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'bag',
  stocktake_content_amount = 1,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Red lentils'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Red lentils'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 1.0, 'kg', 'both', 'bag (1 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Red lentils'));

UPDATE supplier_ingredients si
SET
  supplier_sku = '103946DS',
  ean_code = NULL,
  supplier_article_code = '103946',
  supplier_article_name = 'Rode gedroogde splitlinzen zak 1 kg',
  order_unit = 'DS',
  is_preferred = TRUE,
  updated_at = NOW()
FROM suppliers s, raw_ingredients ri
WHERE si.supplier_id = s.id
  AND si.raw_ingredient_id = ri.id
  AND lower(btrim(s.name)) = 'bidfood'
  AND lower(btrim(ri.name)) = lower(btrim('Red lentils'));

-- ─── Mango: box of 5 × 1 kg bags (Bidfood DS) ────────────────────────────────
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'box',
  stocktake_content_amount = 5,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Mango'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Mango'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 5.0, 'kg', 'both', 'box (5 × 1 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Mango'));

-- ─── Mint: 1 kg bag (stocktake + order) ─────────────────────────────────────
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'bag',
  stocktake_content_amount = 1,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Mint'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Mint'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 1.0, 'kg', 'both', 'bag (1 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Mint'));

-- ─── SOOF Lavender: no longer sold — hide from stocktake/ordering ───────────
UPDATE raw_ingredients
SET stocktake_visible = FALSE, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('SOOF Lavender'));

DELETE FROM supplier_ingredients si
USING raw_ingredients ri
WHERE si.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('SOOF Lavender'));

-- ─── Pickled onion / cabbage: +30% daily prep base ─────────────────────────
UPDATE location_prep_items lpi
SET base_quantity = CASE
  WHEN lower(btrim(pi.name)) = lower(btrim('Pickled onion')) THEN 5.2
  WHEN lower(btrim(pi.name)) = lower(btrim('Pickled cabbage')) THEN 3.9
  ELSE lpi.base_quantity
END,
updated_at = NOW()
FROM prep_items pi
WHERE lpi.prep_item_id = pi.id
  AND lower(btrim(pi.name)) IN (
    lower(btrim('Pickled onion')),
    lower(btrim('Pickled cabbage'))
  );

-- ─── Sugar brown: order by case of 12 × 600 g bags (Tuana) ────────────────
UPDATE ingredient_pack_sizes ips
SET
  size = 7.2,
  size_unit = 'kg',
  display_unit_label = 'case (12 × 600 g)',
  order_pack_multiple = 1,
  updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Sugar brown'))
  AND ips.pack_purpose IN ('order', 'both');

-- ─── All purpose flour: order by case of 10 × 1 kg bags ───────────────────
UPDATE ingredient_pack_sizes ips
SET
  size = 10,
  size_unit = 'kg',
  display_unit_label = 'case (10 × 1 kg)',
  order_pack_multiple = 1,
  updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('All purpose flour'))
  AND ips.pack_purpose IN ('order', 'both');

-- ─── Lemon juice: order by case of 12 × 1 L bottles ───────────────────────
UPDATE ingredient_pack_sizes ips
SET
  size = 12,
  size_unit = 'l',
  display_unit_label = 'case (12 × 1 L)',
  order_pack_multiple = 1,
  updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Lemon juice'))
  AND ips.pack_purpose IN ('order', 'both');

-- ─── Drinks: colli multiple is informational; qty is already in trays ─────
UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 1, updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) IN (
    lower(btrim('Coca Cola')),
    lower(btrim('Coca Cola Zero')),
    lower(btrim('Still water')),
    lower(btrim('Sparkling water')),
    lower(btrim('SOOF Mint')),
    lower(btrim('SOOF Cardamom'))
  )
  AND ips.pack_purpose IN ('order', 'both');

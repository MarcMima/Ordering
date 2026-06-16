-- Kitchen ordering feedback (Jun 2026): pack sizes, supplier prefs, basmati cleanup, aubergine dispatch.

-- ─── Red lentils: Bidfood only (remove Van Gelder link) ─────────────────────
DELETE FROM supplier_ingredients si
USING suppliers s, raw_ingredients ri
WHERE si.supplier_id = s.id
  AND si.raw_ingredient_id = ri.id
  AND lower(btrim(s.name)) LIKE '%van gelder%'
  AND lower(btrim(ri.name)) = lower(btrim('Red lentils'));

UPDATE supplier_ingredients si
SET is_preferred = TRUE, updated_at = NOW()
FROM suppliers s, raw_ingredients ri
WHERE si.supplier_id = s.id
  AND si.raw_ingredient_id = ri.id
  AND lower(btrim(s.name)) = 'bidfood'
  AND lower(btrim(ri.name)) = lower(btrim('Red lentils'));

-- ─── Rice basmati: not used; pandan for soup only ───────────────────────────
UPDATE raw_ingredients
SET stocktake_visible = FALSE, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Rice basmati'));

DELETE FROM supplier_ingredients si
USING raw_ingredients ri
WHERE si.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Rice basmati'));

UPDATE prep_item_ingredients pii
SET raw_ingredient_id = parboiled.id, updated_at = NOW()
FROM prep_items pi, raw_ingredients wrong, raw_ingredients parboiled
WHERE pii.prep_item_id = pi.id
  AND pii.raw_ingredient_id = wrong.id
  AND parboiled.location_id = wrong.location_id
  AND lower(btrim(parboiled.name)) = 'rice parboiled'
  AND lower(btrim(wrong.name)) = 'rice basmati'
  AND lower(btrim(pi.name)) = 'turmeric rice';

-- ─── Aubergine: dispatch qty is crates (KST14ST), not pieces ────────────────
UPDATE supplier_ingredients si
SET order_unit_size = NULL, updated_at = NOW()
FROM suppliers s, raw_ingredients ri
WHERE si.supplier_id = s.id
  AND si.raw_ingredient_id = ri.id
  AND lower(btrim(s.name)) LIKE '%van gelder%'
  AND lower(btrim(ri.name)) = lower(btrim('Aubergine'));

-- ─── Parsley: 4 kg box (base) + 1 kg add-on ─────────────────────────────────
DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Parsley'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 4.0, 'kg', 'order', 'box (4 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Parsley'));

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 1.0, 'kg', 'order', 'bag (1 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Parsley'));

-- ─── Lemon juice: order per 6 bottles ───────────────────────────────────────
UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 6,
    display_unit_label = COALESCE(NULLIF(btrim(ips.display_unit_label), ''), 'bottle') || ' (6-pack)',
    updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Lemon juice'))
  AND ips.pack_purpose IN ('order', 'both');

-- ─── Olive oil: 5 L per bottle ──────────────────────────────────────────────
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'bottle',
  stocktake_content_amount = 5,
  stocktake_content_unit = 'l',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Olive oil'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Olive oil'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 5.0, 'l', 'both', 'bottle (5 L)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Olive oil'));

-- ─── Cauliflower: box of 4 bags ─────────────────────────────────────────────
UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 4,
    display_unit_label = 'bag (box of 4)',
    updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Cauliflower'))
  AND ips.pack_purpose IN ('order', 'both');

-- ─── All purpose flour: 10 packs per order unit ───────────────────────────────
UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 10, updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('All purpose flour'))
  AND ips.pack_purpose IN ('order', 'both');

-- ─── Sugar brown: 12 packs per order unit ───────────────────────────────────
UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 12, updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Sugar brown'))
  AND ips.pack_purpose IN ('order', 'both');

-- ─── Flaxseed broken: 6 bags per order unit ─────────────────────────────────
UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 6, updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Flaxseed broken'))
  AND ips.pack_purpose IN ('order', 'both');

-- ─── Aubergine puree (grilled aubergine): 6 cans per order unit ─────────────
UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 6, updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) IN ('aubergine puree', 'eggplant puree')
  AND ips.pack_purpose IN ('order', 'both');

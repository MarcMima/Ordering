-- Kitchen ordering feedback batch 2 (Jun 2026).

-- ─── Flatbread → Frozen flatbreads ───────────────────────────────────────────
UPDATE raw_ingredients
SET name = 'Frozen flatbreads', updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Flatbread'));

-- ─── Flatbread: daily Java orders — no 65-bag MOQ on suggestions ─────────────
UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 1, updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Frozen flatbreads'))
  AND ips.pack_purpose IN ('order', 'both');

-- ─── Rice flour: stocktake in kg (box 13.6 kg = 34 × 400 g) ─────────────────
UPDATE raw_ingredients
SET
  unit = 'kg',
  stocktake_unit_label = 'box',
  stocktake_content_amount = 13.6,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Rice flour'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Rice flour'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 13.6, 'kg', 'both', 'box (34 × 400 g)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Rice flour'));

-- ─── Still + sparkling water: 18 bottles per tray ────────────────────────────
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'tray',
  stocktake_content_amount = 18,
  stocktake_content_unit = 'pcs',
  updated_at = NOW()
WHERE lower(btrim(name)) IN (lower(btrim('Still water')), lower(btrim('Sparkling water')));

-- ─── Lemon juice: order per 12 bottles ────────────────────────────────────────
UPDATE ingredient_pack_sizes ips
SET
  order_pack_multiple = 12,
  display_unit_label = COALESCE(NULLIF(btrim(ips.display_unit_label), ''), 'bottle') || ' (12-pack)',
  updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Lemon juice'))
  AND ips.pack_purpose IN ('order', 'both');

-- ─── Medi salad: cucumber 1 : tomato 1.5 by weight ───────────────────────────
UPDATE prep_item_ingredients AS pii
SET quantity_per_unit = 2205, updated_at = NOW()
FROM prep_items AS pi
WHERE pii.prep_item_id = pi.id
  AND lower(btrim(pi.name)) = lower(btrim('Mediterranean salad / Medi salad'))
  AND EXISTS (
    SELECT 1 FROM raw_ingredients ri
    WHERE ri.id = pii.raw_ingredient_id AND lower(btrim(ri.name)) = lower(btrim('Tomato'))
  );

-- Chicken pre-marinated, medi salad pairs, marinated chicken stocktake in 10 kg bags.

-- ─── Medi salad 3 kg (VG): order in pairs (cheaper) ───────────────────────────
UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 2, updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Medi salad 3kg'))
  AND ips.pack_purpose IN ('order', 'both');

-- ─── Marinated chicken finished product: count in 10 kg bags ────────────────
UPDATE prep_items
SET
  unit = 'bag',
  content_amount = 10,
  content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Marinated chicken'));

-- 1 stocktake bag = 10 kg pre-marinated chicken (Bidfood delivery unit)
UPDATE prep_item_ingredients pii
SET quantity_per_unit = 10000, updated_at = NOW()
FROM prep_items pi
WHERE pii.prep_item_id = pi.id
  AND lower(btrim(pi.name)) = lower(btrim('Marinated chicken'))
  AND EXISTS (
    SELECT 1 FROM raw_ingredients ri
    WHERE ri.id = pii.raw_ingredient_id AND lower(btrim(ri.name)) = lower(btrim('Chicken'))
  );

-- ─── Chicken marinade: no longer made in-house (buy pre-marinated chicken) ───
UPDATE prep_items
SET stocktake_visible = FALSE, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Chicken marinade'));

UPDATE location_prep_items lpi
SET base_quantity = 0, updated_at = NOW()
FROM prep_items pi
WHERE lpi.prep_item_id = pi.id
  AND lower(btrim(pi.name)) = lower(btrim('Chicken marinade'));

-- Raw ingredients used only by Chicken marinade → hide from stocktake / ordering
UPDATE raw_ingredients ri
SET stocktake_visible = FALSE, updated_at = NOW()
WHERE ri.id IN (
  SELECT pii.raw_ingredient_id
  FROM prep_item_ingredients pii
  JOIN prep_items pi ON pi.id = pii.prep_item_id
  GROUP BY pii.raw_ingredient_id
  HAVING COUNT(DISTINCT pii.prep_item_id) = 1
    AND MAX(lower(btrim(pi.name))) = lower(btrim('Chicken marinade'))
);

DELETE FROM supplier_ingredients si
USING raw_ingredients ri
WHERE si.raw_ingredient_id = ri.id
  AND ri.stocktake_visible = FALSE
  AND ri.id IN (
    SELECT pii.raw_ingredient_id
    FROM prep_item_ingredients pii
    JOIN prep_items pi ON pi.id = pii.prep_item_id
    GROUP BY pii.raw_ingredient_id
    HAVING COUNT(DISTINCT pii.prep_item_id) = 1
      AND MAX(lower(btrim(pi.name))) = lower(btrim('Chicken marinade'))
  );

-- ─── Cauliflower: single bag (2.5 kg) as order unit for standing orders ─────
INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 2.5, 'kg', 'order', 'bag (2.5 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Cauliflower'))
  AND NOT EXISTS (
    SELECT 1 FROM ingredient_pack_sizes ips
    WHERE ips.raw_ingredient_id = raw_ingredients.id
      AND ips.pack_purpose = 'order'
      AND ips.size = 2.5
      AND ips.size_unit = 'kg'
  );

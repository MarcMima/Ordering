-- Bidfood pack fixes (Jul 2026): water tray size, sugar white case, sugar brown bag.

-- ─── Still / sparkling water: 1 pack = 18 bottles (not 1 bottle) ─────────────
UPDATE ingredient_pack_sizes ips
SET size = 18, display_unit_label = 'tray (18 bottles)', updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) IN (lower(btrim('Still water')), lower(btrim('Sparkling water')))
  AND ips.pack_purpose IN ('order', 'both');

-- ─── Sugar white: order by case (10 × 1 kg), not single kg bag ───────────────
DELETE FROM ingredient_pack_sizes ips
USING raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Sugar white'));

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 10, 'kg', 'both', 'case (10 × 1 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Sugar white'));

-- ─── Sugar brown: order by 600 g bag (not 7.2 kg case) ─────────────────────
DELETE FROM ingredient_pack_sizes ips
USING raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Sugar brown'));

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 600, 'g', 'both', 'bag (600 g)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Sugar brown'));

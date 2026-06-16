-- Ordering/catalog: cabbage 2.5kg, pickled −25%, medi salad VG, shifka Bidfood, yoghurt ×6.

-- ─── Pickled onion/cabbage: −25% daily base ───────────────────────────────────
UPDATE location_prep_items lpi
SET base_quantity = CASE
  WHEN lower(btrim(pi.name)) = lower(btrim('Pickled onion')) THEN 3
  WHEN lower(btrim(pi.name)) = lower(btrim('Pickled cabbage')) THEN 2.25
  ELSE lpi.base_quantity
END
FROM prep_items pi
WHERE lpi.prep_item_id = pi.id
  AND lower(btrim(pi.name)) IN (
    lower(btrim('Pickled onion')),
    lower(btrim('Pickled cabbage'))
  );

-- ─── Red cabbage: 2.5 kg bag (Van Gelder kist 2×2.5 kg) ───────────────────────
UPDATE raw_ingredients
SET stocktake_unit_label = 'bag',
    stocktake_content_amount = 2.5,
    stocktake_content_unit = 'kg',
    updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Red cabbage shredded'));

UPDATE ingredient_pack_sizes ips
SET size = 2.5,
    size_unit = 'kg',
    display_unit_label = 'bag (2.5 kg)',
    updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Red cabbage shredded'));

-- ─── Greek yoghurt: order in multiples of 6 ─────────────────────────────────
UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 6, updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Greek yoghurt 10%'));

-- ─── Shifka peppers: Bidfood blik 560 g (art. 169979) ───────────────────────
UPDATE raw_ingredients
SET stocktake_unit_label = 'can',
    stocktake_content_amount = 560,
    stocktake_content_unit = 'g',
    updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Shifka peppers'));

UPDATE ingredient_pack_sizes ips
SET size = 560,
    size_unit = 'g',
    display_unit_label = 'can (560 g)',
    pack_purpose = 'both',
    order_pack_multiple = 1,
    updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Shifka peppers'));

-- Shifka prep → raw (1 can per GN)
DO $$
DECLARE
  loc_id UUID;
  pi_id UUID;
  ri_id UUID;
BEGIN
  SELECT id INTO pi_id FROM prep_items
  WHERE lower(btrim(name)) = lower(btrim('Shifka peppers')) LIMIT 1;
  FOR loc_id IN SELECT id FROM locations
  LOOP
    SELECT id INTO ri_id FROM raw_ingredients
    WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Shifka peppers')) LIMIT 1;
    IF pi_id IS NOT NULL AND ri_id IS NOT NULL THEN
      INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
      VALUES (pi_id, ri_id, 560)
      ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
      SET quantity_per_unit = EXCLUDED.quantity_per_unit;
    END IF;
  END LOOP;
END $$;

INSERT INTO supplier_ingredients (
  supplier_id, raw_ingredient_id, is_preferred,
  supplier_sku, supplier_article_code, supplier_article_name, order_unit
)
SELECT s.id, ri.id, TRUE,
  '169979BL', '169979', 'Shifka hete pepers blik 560 gr', 'BL'
FROM suppliers s
JOIN raw_ingredients ri ON ri.location_id = s.location_id
WHERE lower(btrim(s.name)) = 'bidfood'
  AND lower(btrim(ri.name)) = lower(btrim('Shifka peppers'))
ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
SET
  is_preferred = TRUE,
  supplier_sku = EXCLUDED.supplier_sku,
  supplier_article_code = EXCLUDED.supplier_article_code,
  supplier_article_name = EXCLUDED.supplier_article_name,
  order_unit = EXCLUDED.order_unit,
  updated_at = NOW();

-- ─── Medi salad 3kg: VG EANs (tub + kist 2) ─────────────────────────────────
UPDATE supplier_ingredients si
SET
  supplier_sku = '8713507273175',
  ean_code = '8713507273175',
  supplier_article_code = '161874',
  supplier_article_name = 'Gekruide komkommer-tom brunoise 20mm 3kg stuk',
  order_unit = 'ST',
  is_preferred = TRUE,
  updated_at = NOW()
FROM suppliers s, raw_ingredients ri
WHERE si.supplier_id = s.id
  AND si.raw_ingredient_id = ri.id
  AND lower(btrim(s.name)) = 'van gelder'
  AND lower(btrim(ri.name)) = lower(btrim('Medi salad 3kg'));

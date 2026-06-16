-- Rice pandan (089581, zak 4,5 kg) blijft voor Lebanese lentil soup.
-- Rice basmati blijft uit stocktake; turmeric rice blijft op Rice parboiled (055350).

UPDATE raw_ingredients
SET
  stocktake_visible = TRUE,
  stocktake_unit_label = 'bag',
  stocktake_content_amount = 4.5,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Rice pandan'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Rice pandan'))
);

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple)
SELECT id, 4.5, 'kg', 'both', 'bag (4.5 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Rice pandan'));

UPDATE supplier_ingredients si
SET
  supplier_sku = '089581ZK',
  ean_code = '00680357332063',
  supplier_article_code = '089581',
  supplier_article_name = 'PANDAN RIJST',
  order_unit = 'ZK',
  is_preferred = TRUE,
  updated_at = NOW()
FROM suppliers s, raw_ingredients ri
WHERE si.supplier_id = s.id
  AND si.raw_ingredient_id = ri.id
  AND lower(btrim(s.name)) = 'bidfood'
  AND lower(btrim(ri.name)) = 'rice pandan';

-- Soep: pandan (niet basmati/parboiled)
UPDATE prep_item_ingredients pii
SET raw_ingredient_id = pandan.id, updated_at = NOW()
FROM prep_items pi, raw_ingredients wrong, raw_ingredients pandan
WHERE pii.prep_item_id = pi.id
  AND pii.raw_ingredient_id = wrong.id
  AND pandan.location_id = wrong.location_id
  AND lower(btrim(pi.name)) = 'lebanese lentil soup'
  AND lower(btrim(pandan.name)) = 'rice pandan'
  AND lower(btrim(wrong.name)) IN ('rice basmati', 'rice parboiled');

UPDATE raw_ingredients
SET stocktake_display_order = 422, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Rice pandan'));

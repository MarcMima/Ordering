-- Rice flour: bestellen per doos (34 × 400 g), Bidfood art. 109469 + UOM DS.

UPDATE raw_ingredients
SET
  stocktake_unit_label = 'box',
  stocktake_content_amount = 34,
  stocktake_content_unit = 'pcs',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Rice flour'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Rice flour'))
);

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple)
SELECT id, 34.0, 'pcs', 'both', 'box (34 × 400 g)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Rice flour'));

UPDATE supplier_ingredients si
SET
  supplier_sku = '109469DS',
  supplier_article_code = '109469',
  supplier_article_name = 'Rijstmeel Farmer doos 34×400g',
  order_unit = 'DS',
  updated_at = NOW()
FROM suppliers s, raw_ingredients ri
WHERE si.supplier_id = s.id
  AND si.raw_ingredient_id = ri.id
  AND lower(btrim(s.name)) = 'bidfood'
  AND lower(btrim(ri.name)) = 'rice flour';

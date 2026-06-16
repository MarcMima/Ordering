-- Rice flour (cauliflower coating): Bidfood Farmer rijstmeel pak 400 g, art. 109469.
-- Doos (34 pakken) =zelfde artikelnummer, andere besteleenheid bij Bidfood — standaard per pak (PK).

UPDATE raw_ingredients
SET
  unit = 'g',
  stocktake_unit_label = 'pack',
  stocktake_content_amount = 400,
  stocktake_content_unit = 'g',
  stocktake_visible = TRUE,
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Rice flour'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Rice flour'))
);

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple)
SELECT id, 400.0, 'g', 'both', 'pack (400 g)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Rice flour'));

UPDATE supplier_ingredients si
SET
  supplier_sku = '109469PK',
  supplier_article_code = '109469',
  supplier_article_name = 'Rijstmeel Farmer pak 400g',
  order_unit = 'PK',
  is_preferred = TRUE,
  updated_at = NOW()
FROM suppliers s, raw_ingredients ri
WHERE si.supplier_id = s.id
  AND si.raw_ingredient_id = ri.id
  AND lower(btrim(s.name)) = 'bidfood'
  AND lower(btrim(ri.name)) = 'rice flour';

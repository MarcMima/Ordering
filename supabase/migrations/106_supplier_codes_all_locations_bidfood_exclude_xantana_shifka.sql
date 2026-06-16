-- 1) Kopieer Bidfood- en Van-Gelder-codes van Mima Amsterdam naar alle andere vestigingen (zelfde artikelnaam).
-- 2) Xantana en Shifka peppers: geen Bidfood-bestellijst (geen API-artikelcode; niet via Bidfood bestellen).

WITH amsterdam_codes AS (
  SELECT
    lower(btrim(ri.name)) AS ingredient_name,
    lower(btrim(s.name)) AS supplier_name,
    si.supplier_sku,
    si.ean_code,
    si.supplier_article_code,
    si.supplier_article_name,
    si.order_unit,
    si.order_unit_size,
    si.is_preferred
  FROM supplier_ingredients si
  JOIN suppliers s ON s.id = si.supplier_id
  JOIN raw_ingredients ri ON ri.id = si.raw_ingredient_id
  JOIN locations l ON l.id = s.location_id
  WHERE l.name = 'Mima Amsterdam'
    AND lower(btrim(s.name)) IN ('bidfood', 'van gelder')
    AND (
      (si.supplier_article_code IS NOT NULL AND btrim(si.supplier_article_code) <> '')
      OR (si.ean_code IS NOT NULL AND btrim(si.ean_code) <> '')
      OR (si.supplier_sku IS NOT NULL AND btrim(si.supplier_sku) <> '')
    )
)
UPDATE supplier_ingredients si
SET
  supplier_sku = ac.supplier_sku,
  ean_code = ac.ean_code,
  supplier_article_code = ac.supplier_article_code,
  supplier_article_name = ac.supplier_article_name,
  order_unit = ac.order_unit,
  order_unit_size = ac.order_unit_size,
  updated_at = NOW()
FROM amsterdam_codes ac,
     raw_ingredients ri,
     suppliers s,
     locations loc
WHERE si.raw_ingredient_id = ri.id
  AND si.supplier_id = s.id
  AND s.location_id = loc.id
  AND ri.location_id = loc.id
  AND lower(btrim(ri.name)) = ac.ingredient_name
  AND lower(btrim(s.name)) = ac.supplier_name
  AND loc.name <> 'Mima Amsterdam';

-- Ontbrekende supplier_ingredients-rijen op andere locaties (zelfde template als Amsterdam).
WITH amsterdam_codes AS (
  SELECT
    lower(btrim(ri.name)) AS ingredient_name,
    lower(btrim(s.name)) AS supplier_name,
    si.supplier_sku,
    si.ean_code,
    si.supplier_article_code,
    si.supplier_article_name,
    si.order_unit,
    si.order_unit_size,
    si.is_preferred
  FROM supplier_ingredients si
  JOIN suppliers s ON s.id = si.supplier_id
  JOIN raw_ingredients ri ON ri.id = si.raw_ingredient_id
  JOIN locations l ON l.id = s.location_id
  WHERE l.name = 'Mima Amsterdam'
    AND lower(btrim(s.name)) IN ('bidfood', 'van gelder')
    AND (
      (si.supplier_article_code IS NOT NULL AND btrim(si.supplier_article_code) <> '')
      OR (si.ean_code IS NOT NULL AND btrim(si.ean_code) <> '')
      OR (si.supplier_sku IS NOT NULL AND btrim(si.supplier_sku) <> '')
    )
)
INSERT INTO supplier_ingredients (
  supplier_id,
  raw_ingredient_id,
  supplier_sku,
  ean_code,
  supplier_article_code,
  supplier_article_name,
  order_unit,
  order_unit_size,
  is_preferred
)
SELECT
  s_tgt.id,
  ri_tgt.id,
  ac.supplier_sku,
  ac.ean_code,
  ac.supplier_article_code,
  ac.supplier_article_name,
  ac.order_unit,
  ac.order_unit_size,
  ac.is_preferred
FROM amsterdam_codes ac
JOIN locations loc_am ON loc_am.name = 'Mima Amsterdam'
JOIN locations loc_tgt ON loc_tgt.name <> 'Mima Amsterdam'
JOIN raw_ingredients ri_tgt
  ON ri_tgt.location_id = loc_tgt.id
 AND lower(btrim(ri_tgt.name)) = ac.ingredient_name
JOIN suppliers s_tgt
  ON s_tgt.location_id = loc_tgt.id
 AND lower(btrim(s_tgt.name)) = ac.supplier_name
WHERE NOT (
  ac.supplier_name = 'bidfood'
  AND ac.ingredient_name IN ('xantana', 'shifka peppers')
)
ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
SET
  supplier_sku = EXCLUDED.supplier_sku,
  ean_code = EXCLUDED.ean_code,
  supplier_article_code = EXCLUDED.supplier_article_code,
  supplier_article_name = EXCLUDED.supplier_article_name,
  order_unit = EXCLUDED.order_unit,
  order_unit_size = EXCLUDED.order_unit_size,
  is_preferred = EXCLUDED.is_preferred,
  updated_at = NOW();

-- Niet op Bidfood-bestellijst: verwijder voorkeurskoppeling Bidfood (stocktake blijft op raw_ingredients).
DELETE FROM supplier_ingredients si
USING suppliers s, raw_ingredients ri
WHERE si.supplier_id = s.id
  AND si.raw_ingredient_id = ri.id
  AND lower(btrim(s.name)) = 'bidfood'
  AND lower(btrim(ri.name)) IN ('xantana', 'shifka peppers');

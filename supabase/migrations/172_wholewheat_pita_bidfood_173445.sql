-- Restore wholewheat pita on Bidfood orders (article 173445).
-- Migration 170 removed the link after 422 on wrong article 165354; product stays visible (163).

INSERT INTO supplier_ingredients (
  supplier_id,
  raw_ingredient_id,
  supplier_sku,
  supplier_article_code,
  supplier_article_name,
  order_unit,
  is_preferred,
  bf_is_active
)
SELECT
  s.id,
  ri.id,
  '173445DS',
  '173445',
  'Volkoren pitabrood 13-14cm 110g',
  'DS',
  TRUE,
  TRUE
FROM locations l
JOIN raw_ingredients ri
  ON ri.location_id = l.id
 AND lower(btrim(ri.name)) = lower(btrim('Whole wheat pita bread 15 cm'))
JOIN suppliers s
  ON s.location_id = l.id
 AND lower(btrim(s.name)) = 'bidfood'
ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
SET
  supplier_sku = EXCLUDED.supplier_sku,
  supplier_article_code = EXCLUDED.supplier_article_code,
  supplier_article_name = EXCLUDED.supplier_article_name,
  order_unit = EXCLUDED.order_unit,
  is_preferred = EXCLUDED.is_preferred,
  bf_is_active = TRUE,
  updated_at = NOW();

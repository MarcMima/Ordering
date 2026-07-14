-- Bidfood dispatch fixes (Pijp 422): correct UoM for weekly items, replace discontinued pita, drop hidden whole wheat.

-- Garbage bags: order per roll (RL), not default ST
UPDATE supplier_ingredients si
SET
  order_unit = 'RL',
  supplier_sku = '054362RL',
  updated_at = NOW()
FROM raw_ingredients ri, suppliers s
WHERE si.raw_ingredient_id = ri.id
  AND si.supplier_id = s.id
  AND lower(btrim(s.name)) = 'bidfood'
  AND lower(btrim(ri.name)) = lower(btrim('Garbage bags blue 145L (roll 20)'));

-- Napkins: order per pack (PK)
UPDATE supplier_ingredients si
SET
  order_unit = 'PK',
  supplier_sku = '153946PK',
  updated_at = NOW()
FROM raw_ingredients ri, suppliers s
WHERE si.raw_ingredient_id = ri.id
  AND si.supplier_id = s.id
  AND lower(btrim(s.name)) = 'bidfood'
  AND lower(btrim(ri.name)) = lower(btrim('Napkins Airlaid white 40x40 (pack 60)'));

-- Pita bread 15 cm: 165354 discontinued → 151425 (Bidfood alternative)
UPDATE supplier_ingredients si
SET
  supplier_article_code = '151425',
  supplier_sku = '151425DS',
  supplier_article_name = 'PITA LARGE 15CM',
  order_unit = 'DS',
  bf_is_active = TRUE,
  bf_last_status = NULL,
  updated_at = NOW()
FROM raw_ingredients ri, suppliers s
WHERE si.raw_ingredient_id = ri.id
  AND si.supplier_id = s.id
  AND lower(btrim(s.name)) = 'bidfood'
  AND lower(btrim(ri.name)) = lower(btrim('Pita bread 15 cm'));

-- Whole wheat pita: hidden from stocktake — do not send via Bidfood until restored
DELETE FROM supplier_ingredients si
USING raw_ingredients ri, suppliers s
WHERE si.raw_ingredient_id = ri.id
  AND si.supplier_id = s.id
  AND lower(btrim(s.name)) = 'bidfood'
  AND lower(btrim(ri.name)) = lower(btrim('Whole wheat pita bread 15 cm'));

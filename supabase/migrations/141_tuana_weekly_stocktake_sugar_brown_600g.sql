-- 1) All Tuana (preferred) raw ingredients: weekly stocktake (Monday), same as master weekly column.
UPDATE raw_ingredients ri
SET
  stocktake_day_of_week = 1,
  order_interval_days = 7,
  updated_at = NOW()
WHERE EXISTS (
  SELECT 1
  FROM supplier_ingredients si
  JOIN suppliers s ON s.id = si.supplier_id
  WHERE si.raw_ingredient_id = ri.id
    AND si.is_preferred = true
    AND s.location_id = ri.location_id
    AND lower(btrim(s.name)) = lower(btrim('Tuana'))
);

-- 2) Sugar brown: retail bags are 600 g, not 1 kg.
UPDATE raw_ingredients
SET
  stocktake_content_amount = 600,
  stocktake_content_unit = 'g',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Sugar brown'));

UPDATE ingredient_pack_sizes ips
SET
  size = 600,
  size_unit = 'g',
  updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Sugar brown'));

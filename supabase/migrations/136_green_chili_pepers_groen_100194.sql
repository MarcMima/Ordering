-- Green chili → Pepers groen kist 3 kg (art. 100194), per user mapping.

UPDATE supplier_ingredients si
SET
  supplier_article_code = '100194',
  ean_code = '8713507008203',
  supplier_sku = '8713507008203',
  supplier_article_name = 'Pepers groen kist 3 kilogram',
  order_unit = 'DS1KG',
  order_unit_size = 1,
  vg_is_active = TRUE,
  vg_last_status = 'inactive',
  vg_last_checked_at = NOW(),
  updated_at = NOW()
FROM raw_ingredients r
JOIN suppliers s ON lower(s.name) LIKE '%van gelder%'
WHERE si.raw_ingredient_id = r.id
  AND si.supplier_id = s.id
  AND lower(btrim(r.name)) = lower(btrim('Green chili'))
  AND si.is_preferred = TRUE;

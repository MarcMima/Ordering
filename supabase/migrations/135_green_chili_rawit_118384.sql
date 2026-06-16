-- Green chili: Rawit groen 100gr (118384) — replaces unavailable doos 2kg (118385).

UPDATE supplier_ingredients si
SET
  supplier_article_code = '118384',
  ean_code = '8713507283716',
  supplier_sku = '8713507283716',
  supplier_article_name = 'Rawit groen 100gr',
  order_unit = 'ST',
  order_unit_size = 1,
  vg_is_active = TRUE,
  vg_last_status = 'available',
  vg_last_checked_at = NOW(),
  notes = CASE
    WHEN COALESCE(si.notes, '') LIKE '%118384%' THEN si.notes
    WHEN COALESCE(si.notes, '') = '' THEN 'VG: Rawit groen 100gr (118384).'
    ELSE si.notes || ' VG: Rawit groen 100gr (118384).'
  END,
  updated_at = NOW()
FROM raw_ingredients r
JOIN suppliers s ON lower(s.name) LIKE '%van gelder%'
WHERE si.raw_ingredient_id = r.id
  AND si.supplier_id = s.id
  AND lower(btrim(r.name)) = lower(btrim('Green chili'))
  AND si.is_preferred = TRUE;

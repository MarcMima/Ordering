-- ProductStatus `inactive` is orderable; only `unavailable` blocks. Reset stale vg_is_active=false flags.

UPDATE supplier_ingredients si
SET
  vg_is_active = TRUE,
  vg_last_status = COALESCE(NULLIF(btrim(vg_last_status), ''), 'orderable'),
  vg_last_checked_at = NOW(),
  updated_at = NOW()
FROM suppliers s
WHERE si.supplier_id = s.id
  AND lower(s.name) LIKE '%van gelder%'
  AND si.is_preferred = TRUE
  AND si.ean_code IS NOT NULL
  AND COALESCE(si.vg_is_active, TRUE) = FALSE;

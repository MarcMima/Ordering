-- Bulgur: bestellen via Bidfood (EAN bekend); Van Gelder-mapping niet preferred.

UPDATE supplier_ingredients si
SET
  is_preferred = FALSE,
  updated_at = NOW()
FROM raw_ingredients r
JOIN suppliers s ON lower(btrim(s.name)) LIKE '%van gelder%'
WHERE si.raw_ingredient_id = r.id
  AND si.supplier_id = s.id
  AND lower(btrim(r.name)) = 'bulgur'
  AND si.is_preferred = TRUE;

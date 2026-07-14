-- Olive oil: order via Bidfood (117030), not Van Gelder.

UPDATE supplier_ingredients si
SET
  is_preferred = FALSE,
  updated_at = NOW()
FROM raw_ingredients r, suppliers s
WHERE si.raw_ingredient_id = r.id
  AND si.supplier_id = s.id
  AND lower(btrim(r.name)) = lower(btrim('Olive oil'))
  AND lower(btrim(s.name)) LIKE '%van gelder%'
  AND si.is_preferred = TRUE;

UPDATE supplier_ingredients si
SET
  is_preferred = TRUE,
  updated_at = NOW()
FROM raw_ingredients r, suppliers s
WHERE si.raw_ingredient_id = r.id
  AND si.supplier_id = s.id
  AND r.location_id = s.location_id
  AND lower(btrim(r.name)) = lower(btrim('Olive oil'))
  AND lower(btrim(s.name)) = lower(btrim('Bidfood'));

-- Ensure Bidfood link exists at every location that has Olive oil.
INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
SELECT s.id, r.id, TRUE
FROM raw_ingredients r
JOIN suppliers s ON s.location_id = r.location_id AND lower(btrim(s.name)) = lower(btrim('Bidfood'))
WHERE lower(btrim(r.name)) = lower(btrim('Olive oil'))
ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
  SET is_preferred = TRUE, updated_at = NOW();

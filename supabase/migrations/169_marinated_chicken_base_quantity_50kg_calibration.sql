-- Raise Marinated chicken base_quantity so ordering math targets ~50 kg (not 30 kg)
-- without a hard MIN_ORDER floor. Factor 5/3 ≈ 1.67 on top of existing per-location values.

UPDATE location_prep_items lpi
SET
  base_quantity = ROUND(COALESCE(lpi.base_quantity, 1) * (5.0 / 3.0), 4),
  updated_at = NOW()
FROM prep_items pi
WHERE lpi.prep_item_id = pi.id
  AND lower(btrim(pi.name)) = lower(btrim('Marinated chicken'))
  AND COALESCE(lpi.base_quantity, 1) > 0;

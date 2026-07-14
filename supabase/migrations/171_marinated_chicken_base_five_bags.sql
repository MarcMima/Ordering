-- Marinated chicken base_quantity is in 10 kg BAGS per day at full revenue (not kg).
-- Was 10 bags/day everywhere → ~100 kg per Bidfood order on Pijp.
-- Target ~50 kg/order → 5 bags/day at full capacity.

UPDATE location_prep_items lpi
SET base_quantity = 5.0, updated_at = NOW()
FROM prep_items pi
WHERE lpi.prep_item_id = pi.id
  AND lower(btrim(pi.name)) = lower(btrim('Marinated chicken'));

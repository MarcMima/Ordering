-- Pickled onion/cabbage: ~4 and ~3 GN 1/3 containers per day at full capacity (€4.500).

UPDATE location_prep_items lpi
SET base_quantity = CASE
  WHEN lower(btrim(pi.name)) = lower(btrim('Pickled onion')) THEN 4
  WHEN lower(btrim(pi.name)) = lower(btrim('Pickled cabbage')) THEN 3
  ELSE lpi.base_quantity
END
FROM prep_items pi
WHERE lpi.prep_item_id = pi.id
  AND lower(btrim(pi.name)) IN (
    lower(btrim('Pickled onion')),
    lower(btrim('Pickled cabbage'))
  );

-- Revert pickled daily bases to pre-reduction values (migration 149).
-- Pickled onion: 1.80 → 4 GN 1/3 per day; Pickled cabbage: 1.35 → 3.

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

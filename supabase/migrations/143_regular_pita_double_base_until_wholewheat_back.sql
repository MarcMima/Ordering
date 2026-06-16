-- Whole wheat pita raw not available at Bidfood for now: plan 2 boxes regular (100 pcs/day)
-- instead of 1 regular + 1 wholewheat. Revert regular to base_quantity 1 when whole wheat is back.

UPDATE location_prep_items lpi
SET base_quantity = 2, updated_at = NOW()
FROM prep_items pi
WHERE lpi.prep_item_id = pi.id
  AND lower(btrim(pi.name)) = lower(btrim('Regular pita with za''atar'));

-- Hide whole wheat pita (prep + raw) until Bidfood has stock again.
-- Restore: set stocktake_visible = true on both rows (see comment at bottom).

ALTER TABLE prep_items
  ADD COLUMN IF NOT EXISTS stocktake_visible BOOLEAN NOT NULL DEFAULT true;

UPDATE prep_items
SET stocktake_visible = false, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Wholewheat pita with za''atar'));

UPDATE raw_ingredients
SET stocktake_visible = false, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Whole wheat pita bread 15 cm'));

-- Restore when orderable again:
-- UPDATE prep_items SET stocktake_visible = true, updated_at = NOW()
-- WHERE lower(btrim(name)) = lower(btrim('Wholewheat pita with za''atar'));
-- UPDATE raw_ingredients SET stocktake_visible = true, updated_at = NOW()
-- WHERE lower(btrim(name)) = lower(btrim('Whole wheat pita bread 15 cm'));
-- UPDATE location_prep_items lpi SET base_quantity = 1, updated_at = NOW()
-- FROM prep_items pi WHERE lpi.prep_item_id = pi.id
--   AND lower(btrim(pi.name)) = lower(btrim('Regular pita with za''atar'));

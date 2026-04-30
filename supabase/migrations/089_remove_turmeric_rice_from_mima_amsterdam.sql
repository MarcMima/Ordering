-- Remove Turmeric rice from Mima Amsterdam only.
-- Also remove ingredients that are exclusively used by Turmeric rice for that location.
-- If historical order rows prevent hard delete, keep ingredient but hide from stocktake.

DO $$
DECLARE
  loc_id UUID;
  turmeric_prep_id UUID;
BEGIN
  SELECT id INTO loc_id
  FROM locations
  WHERE lower(btrim(name)) = lower(btrim('Mima Amsterdam'))
  LIMIT 1;

  IF loc_id IS NULL THEN
    RAISE NOTICE 'Location "Mima Amsterdam" not found, skipping turmeric cleanup.';
    RETURN;
  END IF;

  SELECT id INTO turmeric_prep_id
  FROM prep_items
  WHERE lower(btrim(name)) = lower(btrim('Turmeric rice'))
  LIMIT 1;

  IF turmeric_prep_id IS NULL THEN
    RAISE NOTICE 'Prep item "Turmeric rice" not found, skipping.';
    RETURN;
  END IF;

  -- 1) Remove Turmeric rice from prep/stocktake flow for this location.
  DELETE FROM location_prep_items
  WHERE location_id = loc_id
    AND prep_item_id = turmeric_prep_id;

  -- 2) Candidate ingredients: scoped to this location and only linked to Turmeric rice.
  CREATE TEMP TABLE tmp_turmeric_exclusive_raw_ids ON COMMIT DROP AS
  SELECT DISTINCT ri.id
  FROM raw_ingredients ri
  JOIN prep_item_ingredients pii
    ON pii.raw_ingredient_id = ri.id
   AND pii.prep_item_id = turmeric_prep_id
  WHERE ri.location_id = loc_id
    AND NOT EXISTS (
      SELECT 1
      FROM prep_item_ingredients pii_other
      WHERE pii_other.raw_ingredient_id = ri.id
        AND pii_other.prep_item_id <> turmeric_prep_id
    );

  -- Always hide these from stocktake (guarantees they disappear from list).
  UPDATE raw_ingredients
  SET stocktake_visible = false,
      updated_at = NOW()
  WHERE id IN (SELECT id FROM tmp_turmeric_exclusive_raw_ids);

  -- Optional hard delete if not referenced by historical order lines.
  DELETE FROM raw_ingredients ri
  WHERE ri.id IN (SELECT id FROM tmp_turmeric_exclusive_raw_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM order_line_items oli
      WHERE oli.raw_ingredient_id = ri.id
    );
END $$;

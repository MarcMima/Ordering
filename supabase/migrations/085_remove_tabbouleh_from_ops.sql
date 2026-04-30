-- Remove Tabbouleh from operational flows.
-- Safe/idempotent: can be run multiple times.

DO $$
DECLARE
  prep_id UUID;
BEGIN
  -- Hide Tabbouleh dish in menu screens (kitchen filters on active=true).
  UPDATE menu_items
  SET active = false,
      updated_at = NOW()
  WHERE lower(btrim(name)) = 'tabbouleh';

  -- Remove Tabbouleh from prep list generation for all locations.
  SELECT id
  INTO prep_id
  FROM prep_items
  WHERE lower(btrim(name)) = 'tabbouleh'
  LIMIT 1;

  IF prep_id IS NOT NULL THEN
    DELETE FROM location_prep_items
    WHERE prep_item_id = prep_id;
  END IF;
END $$;

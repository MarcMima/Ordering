-- Enforce location isolation on prep_item_ingredients:
-- a raw ingredient may only be linked to a prep item when that location has the prep on its menu.

-- Remove links where the raw ingredient's location does not carry this prep item.
DELETE FROM prep_item_ingredients pii
WHERE NOT EXISTS (
  SELECT 1
  FROM location_prep_items lpi
  JOIN raw_ingredients ri ON ri.location_id = lpi.location_id
  WHERE lpi.prep_item_id = pii.prep_item_id
    AND ri.id = pii.raw_ingredient_id
);

CREATE OR REPLACE FUNCTION enforce_prep_item_ingredient_location_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM location_prep_items lpi
    JOIN raw_ingredients ri ON ri.location_id = lpi.location_id
    WHERE lpi.prep_item_id = NEW.prep_item_id
      AND ri.id = NEW.raw_ingredient_id
  ) THEN
    RAISE EXCEPTION
      'prep_item_ingredients: raw ingredient must belong to a location that has this prep item on the menu';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prep_item_ingredients_location_isolation ON prep_item_ingredients;
CREATE TRIGGER trg_prep_item_ingredients_location_isolation
  BEFORE INSERT OR UPDATE ON prep_item_ingredients
  FOR EACH ROW
  EXECUTE FUNCTION enforce_prep_item_ingredient_location_isolation();

COMMENT ON FUNCTION enforce_prep_item_ingredient_location_isolation IS
  'Prep recipes are per location: raw_ingredient.location_id must match a location_prep_items row for the prep.';

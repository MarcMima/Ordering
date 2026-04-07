-- Per-location raw ingredient order on the stocktake screen (Daily and Weekly lists each use this
-- among their own subset; lower = earlier).

ALTER TABLE raw_ingredients
  ADD COLUMN IF NOT EXISTS stocktake_display_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_raw_ingredients_location_stocktake_order
  ON raw_ingredients(location_id, stocktake_display_order);

COMMENT ON COLUMN raw_ingredients.stocktake_display_order IS
  'Sort order on stocktake raw list within daily vs weekly bucket; lower first. App sorts by this then name.';

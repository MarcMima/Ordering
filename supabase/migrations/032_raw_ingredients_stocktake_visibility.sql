-- Stocktake list visibility (master col I) and weekday filter (master col J weekly → Monday by default in sync).

ALTER TABLE raw_ingredients
  ADD COLUMN IF NOT EXISTS stocktake_visible BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE raw_ingredients
  ADD COLUMN IF NOT EXISTS stocktake_day_of_week SMALLINT NULL;

COMMENT ON COLUMN raw_ingredients.stocktake_visible IS 'Master I: false = hidden from stocktake list.';
COMMENT ON COLUMN raw_ingredients.stocktake_day_of_week IS 'JS getDay(): 0=Sun..6=Sat; NULL = all days. Weekly items use 1 (Monday) from generator.';

ALTER TABLE raw_ingredients DROP CONSTRAINT IF EXISTS raw_ingredients_stocktake_day_of_week_check;
ALTER TABLE raw_ingredients ADD CONSTRAINT raw_ingredients_stocktake_day_of_week_check
  CHECK (stocktake_day_of_week IS NULL OR (stocktake_day_of_week >= 0 AND stocktake_day_of_week <= 6));

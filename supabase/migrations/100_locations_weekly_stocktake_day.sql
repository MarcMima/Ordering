-- Per locatie: vaste weekdag waarop alle weekly-tab stocktake-items meetellen voor workflow-compleetheid.
-- NULL = gebruik per grondstof raw_ingredients.stocktake_day_of_week (bestaand gedrag).

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS weekly_stocktake_day_of_week SMALLINT NULL;

ALTER TABLE locations
  DROP CONSTRAINT IF EXISTS locations_weekly_stocktake_day_of_week_check;

ALTER TABLE locations
  ADD CONSTRAINT locations_weekly_stocktake_day_of_week_check
  CHECK (
    weekly_stocktake_day_of_week IS NULL
    OR (weekly_stocktake_day_of_week >= 0 AND weekly_stocktake_day_of_week <= 6)
  );

COMMENT ON COLUMN locations.weekly_stocktake_day_of_week IS
  'JS weekday 0=Sun..6=Sat: op deze dag moeten weekly-tab stocktake-ingrediënten ingevuld zijn om naar de volgende stap te gaan. NULL = per-ingrediënt stocktake_day_of_week.';

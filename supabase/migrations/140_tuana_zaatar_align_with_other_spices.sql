-- Za'atar (Tuana): same as other Tuana spices — daily stocktake, no order_interval_days override.
UPDATE raw_ingredients
SET
  order_interval_days = NULL,
  stocktake_day_of_week = NULL,
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Za''atar'));

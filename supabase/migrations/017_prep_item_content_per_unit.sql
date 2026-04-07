-- Net content per count unit (bottle, container, bag, …)
-- Used to convert stocktake counts → total g/ml for ordering & prep logic.
--
-- Example: unit = 'bottle', content_amount = 750, content_unit = 'g'
--   → 5 bottles = 3750 g product → recipes can stay in g per bottle or per kg.

ALTER TABLE prep_items
  ADD COLUMN IF NOT EXISTS content_amount NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS content_unit TEXT NULL;

COMMENT ON COLUMN prep_items.content_amount IS
  'Net amount in one count unit (e.g. 750 for 750 g per bottle).';
COMMENT ON COLUMN prep_items.content_unit IS
  'Unit for content_amount: g, ml, kg, etc.';

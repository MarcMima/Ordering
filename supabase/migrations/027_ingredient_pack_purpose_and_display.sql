-- Separate stocktake vs ordering packaging on the same raw ingredient.
-- See docs/INGREDIENTS_SUPPLIERS_ORDERING.md and master sheet columns:
--   stocktaking_* vs ordering_*

-- From 026; repeated here so 027+028 work if 026 was never applied.
ALTER TABLE raw_ingredients
  ADD COLUMN IF NOT EXISTS order_interval_days INTEGER NULL;

COMMENT ON COLUMN raw_ingredients.order_interval_days IS
  'Order suggestion horizon in days (e.g. 7 = weekly). NULL/1 = today only.';

ALTER TABLE ingredient_pack_sizes
  ADD COLUMN IF NOT EXISTS pack_purpose TEXT NOT NULL DEFAULT 'both';

ALTER TABLE ingredient_pack_sizes
  DROP CONSTRAINT IF EXISTS ingredient_pack_sizes_pack_purpose_check;

ALTER TABLE ingredient_pack_sizes
  ADD CONSTRAINT ingredient_pack_sizes_pack_purpose_check
  CHECK (pack_purpose IN ('stocktake', 'order', 'both'));

COMMENT ON COLUMN ingredient_pack_sizes.pack_purpose IS
  'stocktake = count on stocktake; order = default purchase unit; both = same pack for both.';

ALTER TABLE ingredient_pack_sizes
  ADD COLUMN IF NOT EXISTS display_unit_label TEXT NULL;

COMMENT ON COLUMN ingredient_pack_sizes.display_unit_label IS
  'UI label for the count unit, e.g. Sleeve, bag, tray (from master stocktaking_unit / ordering_unit).';

-- From archived 025; app Stocktake still selects this for “count in boxes” (g + pcs pack).
ALTER TABLE ingredient_pack_sizes
  ADD COLUMN IF NOT EXISTS grams_per_piece NUMERIC NULL;

COMMENT ON COLUMN ingredient_pack_sizes.grams_per_piece IS
  'If size_unit is pcs: grams per piece when raw ingredient unit is g (e.g. one retail pack).';

-- If you need a strict unique name per location, merge duplicates first (see migrations_archive/022, 025), then:
-- CREATE UNIQUE INDEX idx_raw_ingredients_location_lower_name ON raw_ingredients (location_id, lower(btrim(name)));

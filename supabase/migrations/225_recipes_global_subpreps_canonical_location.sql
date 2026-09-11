-- 225 — Model audit 11-09-2026 (decisions D-01, D-02, D-03)
-- 1. Recipes are GLOBAL: one line per ingredient, not one per location copy. The trigger that
--    forced recipe lines onto a location-specific ingredient copy is dropped; the ordering engine
--    already remaps recipe lines to the location by ingredient name (orderSuggestion.ts).
-- 2. A prep may contain another prep (sub_prep_item_id). Exactly one of raw_ingredient_id /
--    sub_prep_item_id is set. cost_only marks lines that cost money but do not end up in the
--    product (pickling liquid that is poured off): counted in cost, ignored in nutrition.
-- 3. locations.is_canonical marks the location whose ingredient copies are the reference
--    (Mima Amsterdam). Nutrition values and recipe lines resolve to that copy.

ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_canonical boolean NOT NULL DEFAULT false;
UPDATE locations SET is_canonical = (name = 'Mima Amsterdam');
CREATE UNIQUE INDEX IF NOT EXISTS locations_one_canonical ON locations ((true)) WHERE is_canonical;

DROP TRIGGER IF EXISTS trg_prep_item_ingredients_location_isolation ON prep_item_ingredients;
DROP FUNCTION IF EXISTS enforce_prep_item_ingredient_location_isolation();

ALTER TABLE prep_item_ingredients
  ADD COLUMN IF NOT EXISTS sub_prep_item_id uuid REFERENCES prep_items(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS cost_only boolean NOT NULL DEFAULT false,
  ALTER COLUMN raw_ingredient_id DROP NOT NULL;

ALTER TABLE prep_item_ingredients DROP CONSTRAINT IF EXISTS prep_item_ingredients_exactly_one_source;
ALTER TABLE prep_item_ingredients ADD CONSTRAINT prep_item_ingredients_exactly_one_source
  CHECK ((raw_ingredient_id IS NOT NULL)::int + (sub_prep_item_id IS NOT NULL)::int = 1);
ALTER TABLE prep_item_ingredients DROP CONSTRAINT IF EXISTS prep_item_ingredients_no_self;
ALTER TABLE prep_item_ingredients ADD CONSTRAINT prep_item_ingredients_no_self
  CHECK (sub_prep_item_id IS NULL OR sub_prep_item_id <> prep_item_id);

CREATE INDEX IF NOT EXISTS prep_item_ingredients_sub_prep_idx ON prep_item_ingredients(sub_prep_item_id);

COMMENT ON COLUMN prep_item_ingredients.sub_prep_item_id IS 'Recipe line that uses another prep (quantity_per_unit in grams of that prep).';
COMMENT ON COLUMN prep_item_ingredients.cost_only IS 'Counted in cost price, ignored in nutrition (e.g. pickling liquid that is discarded).';
COMMENT ON COLUMN locations.is_canonical IS 'Reference location for ingredient copies (nutrition values, canonical recipe lines).';

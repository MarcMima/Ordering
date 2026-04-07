-- Recept: per 1 eenheid prep item heb je X eenheden grondstof nodig.
-- raw_ingredient is per locatie; recept wordt dus per locatie gedefinieerd via welke raw_ingredient je koppelt.
CREATE TABLE IF NOT EXISTS prep_item_ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prep_item_id UUID NOT NULL REFERENCES prep_items(id) ON DELETE CASCADE,
  raw_ingredient_id UUID NOT NULL REFERENCES raw_ingredients(id) ON DELETE CASCADE,
  quantity_per_unit NUMERIC NOT NULL CHECK (quantity_per_unit > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(prep_item_id, raw_ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_prep_item_ingredients_prep_item ON prep_item_ingredients(prep_item_id);
CREATE INDEX IF NOT EXISTS idx_prep_item_ingredients_raw_ingredient ON prep_item_ingredients(raw_ingredient_id);

ALTER TABLE prep_item_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read for anon on prep_item_ingredients" ON prep_item_ingredients;
CREATE POLICY "Allow read for anon on prep_item_ingredients"
  ON prep_item_ingredients FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow insert for anon on prep_item_ingredients" ON prep_item_ingredients;
DROP POLICY IF EXISTS "Allow update for anon on prep_item_ingredients" ON prep_item_ingredients;
DROP POLICY IF EXISTS "Allow delete for anon on prep_item_ingredients" ON prep_item_ingredients;
CREATE POLICY "Allow insert for anon on prep_item_ingredients"
  ON prep_item_ingredients FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow update for anon on prep_item_ingredients"
  ON prep_item_ingredients FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for anon on prep_item_ingredients"
  ON prep_item_ingredients FOR DELETE TO anon USING (true);

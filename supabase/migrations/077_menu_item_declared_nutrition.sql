-- 077: Officiële voedingswaarden per gerecht (Mima Excel Gerechten / menukaart)
-- Los van berekende som uit componenten — die blijft voor food-cost / controles.
-- Kitchen UI toont deze waarden als ze bestaan.

CREATE TABLE IF NOT EXISTS menu_item_nutrition (
  menu_item_id UUID PRIMARY KEY REFERENCES menu_items(id) ON DELETE CASCADE,
  kcal NUMERIC NOT NULL,
  protein_g NUMERIC,
  carbs_g NUMERIC,
  sugar_g NUMERIC,
  fat_g NUMERIC,
  sat_fat_g NUMERIC,
  fiber_g NUMERIC,
  salt_g NUMERIC,
  source TEXT NOT NULL DEFAULT 'mima_excel_gerechten',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE menu_item_nutrition IS
  'Voedingswaarden per volledige portie zoals in het gerechten-sheet (autoriteit voor menukaart).';

CREATE INDEX IF NOT EXISTS idx_menu_item_nutrition_menu ON menu_item_nutrition(menu_item_id);

ALTER TABLE menu_item_nutrition ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_item_nutrition_all_auth" ON menu_item_nutrition;
CREATE POLICY "menu_item_nutrition_all_auth" ON menu_item_nutrition
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "menu_item_nutrition_anon_all" ON menu_item_nutrition;
CREATE POLICY "menu_item_nutrition_anon_all" ON menu_item_nutrition
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Flatbread Chicken — Mima sheet (totaal portie)
INSERT INTO menu_item_nutrition (
  menu_item_id, kcal, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source
)
SELECT
  id,
  571, 55, 55, 11, 25, 9, 6, 8,
  'mima_excel_gerechten'
FROM menu_items
WHERE lower(btrim(name)) = 'flatbread chicken'
ON CONFLICT (menu_item_id) DO UPDATE SET
  kcal = EXCLUDED.kcal,
  protein_g = EXCLUDED.protein_g,
  carbs_g = EXCLUDED.carbs_g,
  sugar_g = EXCLUDED.sugar_g,
  fat_g = EXCLUDED.fat_g,
  sat_fat_g = EXCLUDED.sat_fat_g,
  fiber_g = EXCLUDED.fiber_g,
  salt_g = EXCLUDED.salt_g,
  source = EXCLUDED.source,
  updated_at = NOW();

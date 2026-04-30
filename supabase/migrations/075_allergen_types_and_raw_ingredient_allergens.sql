-- 075: Allergenen op grondstofniveau (EU-logica) + koppeltabel
-- Voedings-/allergenen-weergave in app gebruikt raw_ingredient_allergens en receptregels.

CREATE TABLE IF NOT EXISTS allergen_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label_nl TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS raw_ingredient_allergens (
  raw_ingredient_id UUID NOT NULL REFERENCES raw_ingredients(id) ON DELETE CASCADE,
  allergen_id UUID NOT NULL REFERENCES allergen_types(id) ON DELETE CASCADE,
  PRIMARY KEY (raw_ingredient_id, allergen_id)
);

CREATE INDEX IF NOT EXISTS idx_raw_ingredient_allergens_allergen
  ON raw_ingredient_allergens(allergen_id);

COMMENT ON TABLE allergen_types IS 'Vaste lijst (EU); code is stabiele sleutel voor UI.';
COMMENT ON TABLE raw_ingredient_allergens IS 'Welke allergenen een grondstof bevat (zonder sporen).';

-- EU 14 (Nederlandse benamingen)
INSERT INTO allergen_types (code, label_nl, sort_order) VALUES
  ('gluten', 'Glutenbevattende granen', 10),
  ('schaaldieren', 'Schaaldieren en producten daarvan', 20),
  ('eieren', 'Eieren en producten daarvan', 30),
  ('vis', 'Vis en producten daarvan', 40),
  ('pinda', 'Pinda''s en producten daarvan', 50),
  ('soja', 'Soja en producten daarvan', 60),
  ('melk', 'Melk en producten daarvan', 70),
  ('noten', 'Noten en producten daarvan', 80),
  ('selderij', 'Selderij en producten daarvan', 90),
  ('mosterd', 'Mosterd en producten daarvan', 100),
  ('sesam', 'Sesamzaad en producten daarvan', 110),
  ('sulfiet', 'Zwaveldioxide en sulfieten', 120),
  ('lupine', 'Lupine en producten daarvan', 130),
  ('weekdieren', 'Weekdieren en producten daarvan', 140)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE allergen_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_ingredient_allergens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allergen_types_read_anon" ON allergen_types;
CREATE POLICY "allergen_types_read_anon"
  ON allergen_types FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "allergen_types_read_auth" ON allergen_types;
CREATE POLICY "allergen_types_read_auth"
  ON allergen_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "raw_ingredient_allergens_all_anon" ON raw_ingredient_allergens;
CREATE POLICY "raw_ingredient_allergens_all_anon"
  ON raw_ingredient_allergens FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "raw_ingredient_allergens_all_auth" ON raw_ingredient_allergens;
CREATE POLICY "raw_ingredient_allergens_all_auth"
  ON raw_ingredient_allergens FOR ALL TO authenticated USING (true) WITH CHECK (true);

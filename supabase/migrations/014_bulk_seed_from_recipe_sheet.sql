-- Bulk import receptenboek → prep_items (Products), raw_ingredients (Ingredients), prep_item_ingredients
-- Alles in grammen: unit = 'g', quantity_per_unit = gram per 1 eenheid prep item.
--
-- GEBRUIK:
-- Plak dit HELE bestand in Supabase SQL Editor en Run (één keer).
-- Onderstaand blok maakt prep_item_ingredients aan als die nog niet bestaat — geen aparte 015 meer nodig.
--
-- Waarom niet “automatisch”? De app/repo kan geen SQL op jouw Supabase-cloud uitvoeren; alleen jij
-- (of supabase db push) past migraties toe. Dit bestand doet create-if-missing + bulk import in één run.
--
-- Let op: prep_items heeft geen UNIQUE op name; het script voorkomt dubbele namen via NOT EXISTS.
-- raw_ingredients is per locatie; zelfde grondstofnaam op andere locatie = aparte rij.

-- =============================================================================
-- EERST: tabel prep_item_ingredients aanmaken als die nog niet bestaat (idempotent)
-- =============================================================================
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

-- =============================================================================
-- location_prep_items.base_quantity (migratie 007) — nodig voor prep list + dit script
-- =============================================================================
ALTER TABLE location_prep_items
  ADD COLUMN IF NOT EXISTS base_quantity NUMERIC NOT NULL DEFAULT 1;

-- =============================================================================
-- DAARNA: bulk import (DO block)
-- =============================================================================
DO $$
DECLARE
  loc_id UUID := 'ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a'; -- jouw location (Mima Amsterdam o.i.d.)
BEGIN
  -- loc_id is gezet; geen placeholder meer

  -- =============================================================================
  -- STAP 1: Staging — plak hier je rijen (prep_item_name, raw_ingredient_name, quantity_per_unit in gram)
  -- =============================================================================
  CREATE TEMP TABLE recipe_rows (
    prep_item_name TEXT NOT NULL,
    raw_ingredient_name TEXT NOT NULL,
    quantity_per_unit NUMERIC NOT NULL
  ) ON COMMIT DROP;

  -- Receptenboek (alles in gram) — uit spreadsheet
  INSERT INTO recipe_rows (prep_item_name, raw_ingredient_name, quantity_per_unit) VALUES
    ('Mudardara', 'Lentils', 500),
    ('Mudardara', 'Water', 1300),
    ('Mudardara', 'Cumin', 6.3),
    ('Mudardara', 'Salt', 18),
    ('Mudardara', 'Ground pepp', 1.2),
    ('Mudardara', 'Olive oil', 54.6),
    ('Mudardara', 'Bulgur', 500),
    ('Falafel', 'Fresh garlic', 60),
    ('Falafel', 'White onion', 1000),
    ('Falafel', 'Fresh corian', 370),
    ('Falafel', 'Fresh parsle', 800),
    ('Falafel', 'Soaked chick', 5700),
    ('Falafel', 'Falafel spice', 180),
    ('Aubergine / Sabich', 'Aubergine', 3000),
    ('Aubergine / Sabich', 'Salt', 45),
    ('Chicken marinade', 'Tomato past', 3200),
    ('Chicken marinade', 'Fresh garlic', 370),
    ('Chicken marinade', 'Water', 950),
    ('Chicken marinade', 'Lemon juice', 1380),
    ('Chicken marinade', 'Sunflower oi', 1820),
    ('Chicken marinade', 'Spicemix chi', 528),
    ('Chicken marinade', 'Ve Tsin', 126),
    ('Marinated chicken', 'Chicken thigf', 10000),
    ('Marinated chicken', 'Chicken mari', 1200),
    ('Hummus', 'Cooked chick', 4000),
    ('Hummus', 'Lemon juice', 1216),
    ('Hummus', 'Tahini', 1888),
    ('Hummus', 'Salt', 72),
    ('Babe ghanouj', 'Grilled aube', 2800),
    ('Babe ghanouj', 'Tahini', 507.4),
    ('Babe ghanouj', 'Lemon juice', 195.7),
    ('Babe ghanouj', 'Salt', 10.5),
    ('Tzatziki', 'Yoghurt', 6000),
    ('Tzatziki', 'Cucumber', 2100),
    ('Tzatziki', 'Salt', 36),
    ('Tzatziki', 'Dried dill', 45),
    ('Tarator', 'Tahini', 3068),
    ('Tarator', 'Water', 2100),
    ('Tarator', 'Lemon juice', 329.6),
    ('Tarator', 'Salt', 18),
    ('Amba', 'Mango', 3000),
    ('Amba', 'Fresh garlic', 60),
    ('Amba', 'Olive oil', 218.4),
    ('Amba', 'Cumin', 8.4),
    ('Amba', 'Sumac', 4.6),
    ('Amba', 'Chili pepper', 10),
    ('Amba', 'Salt', 24),
    ('Amba', 'Mustard pow', 21.1),
    ('Amba', 'Lemon juice', 247.2),
    ('Amba', 'Vinegar', 484.8),
    ('Srug', 'Fresh garlic', 10),
    ('Srug', 'Green jalape', 500),
    ('Srug', 'Birds eye chi', 100),
    ('Srug', 'Coriander', 320),
    ('Srug', 'Olive oil', 873.6),
    ('Srug', 'Salt', 6),
    ('Srug', 'Cumin', 4.2),
    ('Srug', 'Cardamom', 2.1),
    ('Srug', 'Xantana', 0.6),
    ('Tahin brownie dough', 'Ground flax', 256),
    ('Tahin brownie dough', 'Water', 1000),
    ('Tahin brownie dough', 'Tahini', 1000),
    ('Tahin brownie dough', 'White sugar', 1500),
    ('Tahin brownie dough', 'Brown sugar', 1800),
    ('Tahin brownie dough', 'Vanilla extra', 71.2),
    ('Tahin brownie dough', 'All purpose f', 1000),
    ('Tahin brownie dough', 'Cacan', 70),
    ('Tahin brownie dough', 'Salt', 36),
    ('Tahin brownie dough', 'Baking powd', 24),
    ('Pickling liquid', 'Hot water', 2500),
    ('Pickling liquid', 'Salt', 180),
    ('Pickling liquid', 'Sugar', 127.5),
    ('Pickling liquid', 'Vinegar', 7575),
    ('Pickled cabbage', 'Sliced veggie', 3000),
    ('Pickled onion', 'Sliced veggie', 3000),
    ('Feta', 'Feta', 900),
    ('Lettuce', 'Lettuce', 5000),
    ('Pomegranate', 'Pomegrana', 3920),
    ('Mediterranean salad / Medi salad', 'Diced tomat', 20000),
    ('Mediterranean salad / Medi salad', 'Cucumber', 29400),
    ('Mediterranean salad / Medi salad', 'Cut parsley', 15),
    ('Boiled eggs', 'Eggs', 5400),
    ('Za''atar flatbread chips', 'Flatbread', 210),
    ('Za''atar flatbread chips', 'Za''Aatar', 18),
    ('Za''atar flatbread chips', 'Salt', 6),
    ('Lebanese lentil soup', 'Olive oil', 40),
    ('Lebanese lentil soup', 'White onion', 200),
    ('Lebanese lentil soup', 'Carrots', 220),
    ('Lebanese lentil soup', 'Celery', 90),
    ('Lebanese lentil soup', 'Garlic', 12),
    ('Lebanese lentil soup', 'Red lentlls', 285),
    ('Lebanese lentil soup', 'Rice', 100),
    ('Lebanese lentil soup', 'Water', 2400),
    ('Lebanese lentil soup', 'Stock cubes', 50),
    ('Lebanese lentil soup', 'Lemon juice', 100),
    ('Lebanese lentil soup', 'Kurkuma', 2.5),
    ('Lebanese lentil soup', 'Cumin', 4.2),
    ('Lebanese lentil soup', 'Black pepper', 2.4),
    ('Rose lemonade', 'Sugar', 175),
    ('Rose lemonade', 'Rose petals', 45),
    ('Rose lemonade', 'Water', 5000),
    ('Rose lemonade', 'Lemon juice', 65),
    ('Turmeric rice', 'Basmati rice', 1000),
    ('Turmeric rice', 'Water', 1700),
    ('Turmeric rice', 'Turmeric', 15),
    ('Turmeric rice', 'Cumin', 6.3),
    ('Turmeric rice', 'Salt', 18),
    ('Turmeric rice', 'Ground pepp', 2.3),
    ('Turmeric rice', 'Neutral oil', 87.8),
    ('Turmeric rice', 'Vegetable st', 40),
    ('Turmeric rice', 'Chopped par', 30);

  -- =============================================================================
  -- STAP 2: prep_items (Products) — unieke prep_item_name, unit g
  -- =============================================================================
  INSERT INTO prep_items (name, unit)
  SELECT DISTINCT trim(rr.prep_item_name), 'g'
  FROM recipe_rows rr
  WHERE trim(rr.prep_item_name) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM prep_items p
      WHERE lower(trim(p.name)) = lower(trim(rr.prep_item_name))
    );

  -- =============================================================================
  -- STAP 3: raw_ingredients — unieke raw_ingredient_name voor deze locatie, unit g
  -- =============================================================================
  INSERT INTO raw_ingredients (location_id, name, unit)
  SELECT DISTINCT loc_id, trim(rr.raw_ingredient_name), 'g'
  FROM recipe_rows rr
  WHERE trim(rr.raw_ingredient_name) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM raw_ingredients r
      WHERE r.location_id = loc_id
        AND lower(trim(r.name)) = lower(trim(rr.raw_ingredient_name))
    );

  -- =============================================================================
  -- STAP 4: prep_item_ingredients — koppeling + hoeveelheid (gram)
  -- =============================================================================
  INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
  SELECT p.id, r.id, rr.quantity_per_unit
  FROM recipe_rows rr
  JOIN prep_items p ON lower(trim(p.name)) = lower(trim(rr.prep_item_name))
  JOIN raw_ingredients r
    ON r.location_id = loc_id
   AND lower(trim(r.name)) = lower(trim(rr.raw_ingredient_name))
  WHERE rr.quantity_per_unit > 0
  ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
    SET quantity_per_unit = EXCLUDED.quantity_per_unit,
        updated_at = NOW();

  -- =============================================================================
  -- OPTIONEEL STAP 5: alle prep_items uit recipe_rows aan locatie koppelen (Stocktake)
  -- =============================================================================
  INSERT INTO location_prep_items (location_id, prep_item_id, base_quantity)
  SELECT loc_id, p.id, 1
  FROM prep_items p
  WHERE lower(trim(p.name)) IN (SELECT lower(trim(prep_item_name)) FROM recipe_rows)
  ON CONFLICT (location_id, prep_item_id) DO NOTHING;

END $$;

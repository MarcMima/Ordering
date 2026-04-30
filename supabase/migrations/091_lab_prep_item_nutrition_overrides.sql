-- Lab measured nutrition overrides for prepared components.
-- Values are per 100 g from the provided "Voedingswaarden Mima" table.

ALTER TABLE prep_item_nutritional_values
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('lab', 'supplier_spec', 'nevo', 'excel', 'manual')),
  ADD COLUMN IF NOT EXISTS source_priority INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS measured_at DATE,
  ADD COLUMN IF NOT EXISTS verified_by TEXT,
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

WITH lab_values(sheet_name, kcal, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g) AS (
  VALUES
    ('grilled chicken', 227::numeric, 28.8::numeric, 0::numeric, 0::numeric, 12::numeric, 3.3::numeric, 1.1::numeric, 0.81::numeric),
    ('cauliflower', 219::numeric, 3.2::numeric, 9.8::numeric, 3.4::numeric, 18::numeric, 1.8::numeric, 4.5::numeric, 0.87::numeric),
    ('falafel', 324::numeric, 10::numeric, 19::numeric, 2::numeric, 22::numeric, 2.2::numeric, 8::numeric, 2::numeric),
    ('sabich', 149::numeric, 2::numeric, 4.5::numeric, 3.6::numeric, 12::numeric, 1.3::numeric, 5.5::numeric, 1.2::numeric),
    ('flatbread chips', 559::numeric, 6.9::numeric, 42::numeric, 2.5::numeric, 44::numeric, 4.5::numeric, 2.9::numeric, 0.97::numeric)
),
prep_map AS (
  SELECT
    p.id AS prep_item_id,
    v.*
  FROM prep_items p
  JOIN lab_values v
    ON (
      (v.sheet_name = 'grilled chicken' AND lower(btrim(p.name)) IN ('marinated chicken', 'grilled chicken'))
      OR (v.sheet_name = 'cauliflower' AND lower(btrim(p.name)) IN ('coated cauliflower', 'cauliflower'))
      OR (v.sheet_name = 'falafel' AND lower(btrim(p.name)) = 'falafel')
      OR (v.sheet_name = 'sabich' AND lower(btrim(p.name)) IN ('aubergine / sabich', 'sabich'))
      OR (v.sheet_name = 'flatbread chips' AND lower(btrim(p.name)) IN ('za''atar flatbread chips', 'flatbread chips'))
    )
)
INSERT INTO prep_item_nutritional_values (
  prep_item_id,
  kcal_per_100g, protein_per_100g, carbs_per_100g, sugar_per_100g,
  fat_per_100g, sat_fat_per_100g, fiber_per_100g, salt_per_100g,
  source, source_type, source_priority, measured_at, verified_by, is_locked, calculated_at, updated_at
)
SELECT
  pm.prep_item_id,
  pm.kcal, pm.protein_g, pm.carbs_g, pm.sugar_g,
  pm.fat_g, pm.sat_fat_g, pm.fiber_g, pm.salt_g,
  'Voedingswaarden Mima (lab sheet)',
  'lab',
  100,
  CURRENT_DATE,
  'mima_lab',
  true,
  NOW(),
  NOW()
FROM prep_map pm
ON CONFLICT (prep_item_id) DO UPDATE SET
  kcal_per_100g = EXCLUDED.kcal_per_100g,
  protein_per_100g = EXCLUDED.protein_per_100g,
  carbs_per_100g = EXCLUDED.carbs_per_100g,
  sugar_per_100g = EXCLUDED.sugar_per_100g,
  fat_per_100g = EXCLUDED.fat_per_100g,
  sat_fat_per_100g = EXCLUDED.sat_fat_per_100g,
  fiber_per_100g = EXCLUDED.fiber_per_100g,
  salt_per_100g = EXCLUDED.salt_per_100g,
  source = EXCLUDED.source,
  source_type = EXCLUDED.source_type,
  source_priority = EXCLUDED.source_priority,
  measured_at = EXCLUDED.measured_at,
  verified_by = EXCLUDED.verified_by,
  is_locked = true,
  calculated_at = NOW(),
  updated_at = NOW();

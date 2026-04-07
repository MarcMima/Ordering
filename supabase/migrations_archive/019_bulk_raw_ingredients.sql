-- Bulk import: raw_ingredients (Ingredients) for one location
--
-- Use:
-- 1) Set loc_id below to your locations.id
-- 2) Paste your ingredient rows into the VALUES block
-- 3) Run in Supabase SQL Editor (safe to re-run)
--
-- Matching: name is de-duped per location using trim + case-insensitive compare.
-- Unit should be consistent (recommended: 'g' for weight-based items).
-- If you want piece-based items, use 'pcs' etc.

DO $$
DECLARE
  loc_id UUID := 'ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a';
BEGIN
  -- Staging
  CREATE TEMP TABLE ingredient_rows (
    raw_ingredient_name TEXT NOT NULL,
    unit TEXT NOT NULL
  ) ON COMMIT DROP;

  -- Paste your full list here (examples only)
  INSERT INTO ingredient_rows (raw_ingredient_name, unit) VALUES
    ('Salt', 'g'),
    ('Olive oil', 'g');

  -- Insert missing ingredients for this location
  INSERT INTO raw_ingredients (location_id, name, unit)
  SELECT DISTINCT
    loc_id,
    btrim(ir.raw_ingredient_name),
    btrim(ir.unit)
  FROM ingredient_rows ir
  WHERE btrim(ir.raw_ingredient_name) <> ''
    AND btrim(ir.unit) <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM raw_ingredients r
      WHERE r.location_id = loc_id
        AND lower(btrim(r.name)) = lower(btrim(ir.raw_ingredient_name))
    );

END $$;

-- Reporting (total after insert)
SELECT
  loc_id AS location_id,
  (SELECT count(*) FROM raw_ingredients WHERE location_id = loc_id) AS total_raw_ingredients_for_location;


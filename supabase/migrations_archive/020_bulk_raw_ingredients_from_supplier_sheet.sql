-- Bulk import: raw ingredients list (from supplier/order sheet)
--
-- Input columns (from CSV):
--   product, type_unit, leverancier
--
-- What this script does (safe to re-run):
-- 1) Inserts missing raw_ingredients for ONE location (dedupe by trim+case-insensitive)
-- 2) Inserts missing suppliers (by name) for that location (if leverancier provided)
-- 3) Inserts supplier_ingredients mapping (supplier ↔ raw ingredient) (if leverancier provided)
--
-- IMPORTANT NOTE ABOUT UNITS:
-- The CSV's type_unit is usually a purchasing/packaging unit (Box/Bag/Can/etc).
-- For recipe math (grams), you'd normally keep raw_ingredients.unit = 'g' and model packaging via ingredient_pack_sizes.
-- For now this script stores a pragmatic stocktake unit:
--   - pieces/heads/bunch/units/rolls -> 'pcs'
--   - everything else -> 'g'
-- You can refine later by adding pack sizes and/or supplier SKUs.

-- =============================================================================
-- Ensure anon can read/write raw_ingredients (required for Stocktake + Admin)
-- =============================================================================
ALTER TABLE raw_ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read for anon on raw_ingredients" ON raw_ingredients;
DROP POLICY IF EXISTS "Allow insert for anon on raw_ingredients" ON raw_ingredients;
DROP POLICY IF EXISTS "Allow update for anon on raw_ingredients" ON raw_ingredients;
DROP POLICY IF EXISTS "Allow delete for anon on raw_ingredients" ON raw_ingredients;

CREATE POLICY "Allow read for anon on raw_ingredients"
  ON raw_ingredients FOR SELECT TO anon USING (true);
CREATE POLICY "Allow insert for anon on raw_ingredients"
  ON raw_ingredients FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow update for anon on raw_ingredients"
  ON raw_ingredients FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for anon on raw_ingredients"
  ON raw_ingredients FOR DELETE TO anon USING (true);

-- =============================================================================
-- Ensure supplier_ingredients exists (if 016 wasn't applied yet)
-- =============================================================================
CREATE TABLE IF NOT EXISTS supplier_ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  raw_ingredient_id UUID NOT NULL REFERENCES raw_ingredients(id) ON DELETE CASCADE,
  supplier_sku TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_id, raw_ingredient_id)
);

-- If the table already existed from an earlier version, ensure expected columns exist.
ALTER TABLE supplier_ingredients
  ADD COLUMN IF NOT EXISTS supplier_sku TEXT,
  ADD COLUMN IF NOT EXISTS is_preferred BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE supplier_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read for anon on supplier_ingredients" ON supplier_ingredients;
DROP POLICY IF EXISTS "Allow insert for anon on supplier_ingredients" ON supplier_ingredients;
DROP POLICY IF EXISTS "Allow update for anon on supplier_ingredients" ON supplier_ingredients;
DROP POLICY IF EXISTS "Allow delete for anon on supplier_ingredients" ON supplier_ingredients;

CREATE POLICY "Allow read for anon on supplier_ingredients"
  ON supplier_ingredients FOR SELECT TO anon USING (true);
CREATE POLICY "Allow insert for anon on supplier_ingredients"
  ON supplier_ingredients FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow update for anon on supplier_ingredients"
  ON supplier_ingredients FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for anon on supplier_ingredients"
  ON supplier_ingredients FOR DELETE TO anon USING (true);

DO $$
DECLARE
  loc_id UUID := 'ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a';
BEGIN
  CREATE TEMP TABLE import_rows (
    product TEXT NOT NULL,
    type_unit TEXT,
    supplier_name TEXT
  ) ON COMMIT DROP;

  -- Paste list here (pre-filled from your message). supplier_name can be NULL/blank.
  INSERT INTO import_rows (product, type_unit, supplier_name) VALUES
    ('Aubergine', 'Pieces', NULL),
    ('Parsley - whole', 'kg', NULL),
    ('Koriander', 'kg', NULL),
    ('Mint', 'Bunch', NULL),
    ('Celery', 'Bags', NULL),
    ('Carrot - 1kg', 'Bag', NULL),
    ('Garlic - Puree 1kg', 'Bag', NULL),
    ('Garlic - Peeled 1kg', 'Tub', NULL),
    ('Pomegranate seeds', 'Container', NULL),
    ('Cucumbers', 'Pieces', NULL),
    ('Tomatoes cubed - 1kg', 'Container', NULL),
    ('Green chilis - 3kg', 'Box', NULL),
    ('Red cabbage - shaved', 'kg', NULL),
    ('Red onion - sliced', 'kg', NULL),
    ('Romaine lettuce', 'Heads', NULL),
    ('White onion peeled - 1kg', 'Bag', NULL),
    ('Olive oil', 'Can', NULL),
    ('Green lentils (10kg)', 'Bag', NULL),
    ('Chickpeas (10kg)', 'Bag', NULL),
    ('Red lentils - 500g', 'Bags', NULL),
    ('Eggs', 'Box', NULL),
    ('Lemon juice', 'Bottles', NULL),
    ('Cauliflower', 'Bags', NULL),
    ('Tomato puree', 'Cans', NULL),
    ('Brown sugar', 'Bags', NULL),
    ('White sugar', 'Bags', NULL),
    ('Honey sticks', 'Box', NULL),
    ('Sunflower oil', 'Box', NULL),
    ('Baking soda', 'Boxes', NULL),
    ('Baking powder', 'Can', NULL),
    ('Bulgur', 'Bags', NULL),
    ('Mango', 'Box', NULL),
    ('Ve Tsin', 'Can', NULL),
    ('Stock bouillon', 'Can', NULL),
    ('Vinegar', 'Cans', NULL),
    ('Sea salt', '1/3', NULL),
    ('Pandan rice (soup)', 'Bag (4.5kg)', NULL),
    ('Parboiled rice (tumeric rice)', 'Bag (10kg)', NULL),
    ('Feta', '900 g pack', NULL),
    ('Yoghurt', 'Tubs', NULL),
    ('Rubbish bin bags', 'Rolls', NULL),
    ('Heineken 0.0', 'Units', NULL),
    ('SOOF Cardemom', 'Units', NULL),
    ('SOOF Lavender', 'Units', NULL),
    ('SOOF Munt', 'Units', NULL),
    ('Coca Cola Zero', 'Units', NULL),
    ('Coca Cola regular', 'Units', NULL),
    ('MSM Sparkling', 'Units', NULL),
    ('MSM flat', 'Units', NULL);

  -- 1) Insert raw ingredients (dedupe per location)
  INSERT INTO raw_ingredients (location_id, name, unit)
  SELECT DISTINCT
    loc_id,
    btrim(r.product),
    CASE
      WHEN r.type_unit IS NULL THEN 'g'
      WHEN lower(btrim(r.type_unit)) IN ('piece', 'pieces', 'head', 'heads', 'bunch', 'bunches', 'unit', 'units', 'roll', 'rolls', 'pcs') THEN 'pcs'
      ELSE 'g'
    END
  FROM import_rows r
  WHERE btrim(r.product) <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM raw_ingredients ri
      WHERE ri.location_id = loc_id
        AND lower(btrim(ri.name)) = lower(btrim(r.product))
    );

  -- 2) Insert suppliers (only where supplier_name provided)
  INSERT INTO suppliers (location_id, name)
  SELECT DISTINCT
    loc_id,
    btrim(r.supplier_name)
  FROM import_rows r
  WHERE r.supplier_name IS NOT NULL
    AND btrim(r.supplier_name) <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM suppliers s
      WHERE s.location_id = loc_id
        AND lower(btrim(s.name)) = lower(btrim(r.supplier_name))
    );

  -- 3) Map ingredients to suppliers (preferred)
  INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
  SELECT
    s.id,
    ri.id,
    true
  FROM import_rows r
  JOIN suppliers s
    ON s.location_id = loc_id
   AND lower(btrim(s.name)) = lower(btrim(r.supplier_name))
  JOIN raw_ingredients ri
    ON ri.location_id = loc_id
   AND lower(btrim(ri.name)) = lower(btrim(r.product))
  WHERE r.supplier_name IS NOT NULL
    AND btrim(r.supplier_name) <> ''
  ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
    SET is_preferred = EXCLUDED.is_preferred,
        updated_at = NOW();
END $$;

-- Report totals
SELECT
  (SELECT count(*) FROM raw_ingredients WHERE location_id = 'ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a') AS raw_ingredients_total,
  (SELECT count(*) FROM suppliers WHERE location_id = 'ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a') AS suppliers_total,
  (SELECT count(*) FROM supplier_ingredients) AS supplier_ingredients_total;


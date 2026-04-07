-- Bulk sync from supplier sheet export (product/unit/content_amount/content_unit/supplier/visible)
-- to:
--   - ingredient_pack_sizes (so Stocktake can count in packs)
--   - suppliers (create if missing)
--   - supplier_ingredients (map raw ingredient -> supplier; is_preferred based on visible)
--
-- This is designed to be re-runnable.
--
-- Input columns (as pasted in the INSERT below):
--   product, unit, content_amount, content_unit, supplier, visible
--
-- Notes:
-- - Matching is done by raw_ingredients.name (case-insensitive, trimmed).
-- - ingredient_pack_sizes are overwritten (deleted + inserted) for matched ingredients in this script.
-- - supplier_ingredients.is_preferred is set to TRUE when visible = 1, else FALSE.
-- - Stocktake will only show pack counting when ingredient_pack_sizes can be converted to raw_ingredients.unit
--   (currently supported in the app: g/kg, ml/l, pcs).

DO $$
DECLARE
  loc_id UUID := 'ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a';
  r RECORD;
BEGIN
  -- Ensure columns exist (older schemas may miss them)
  ALTER TABLE supplier_ingredients
    ADD COLUMN IF NOT EXISTS supplier_sku TEXT,
    ADD COLUMN IF NOT EXISTS is_preferred BOOLEAN NOT NULL DEFAULT false;

  ALTER TABLE supplier_ingredients ENABLE ROW LEVEL SECURITY;

  -- Staging
  CREATE TEMP TABLE sheet_rows (
    product TEXT NOT NULL,
    unit TEXT,
    content_amount NUMERIC NOT NULL,
    content_unit TEXT NOT NULL,
    supplier_name TEXT,
    visible INTEGER NOT NULL DEFAULT 1
  ) ON COMMIT DROP;

  INSERT INTO sheet_rows (product, unit, content_amount, content_unit, supplier_name, visible) VALUES
    ('Onion peeled', 'bag', 5, 'kg', 'Van Gelder', 1),
    ('Spring onion', 'kg', 1, 'kg', 'Van Gelder', 1),
    ('Tomatoes mix', 'box', 6, 'kg', 'Van Gelder', 1),
    ('Flaxseed broken', 'bag', 8.5, 'kg', 'Van Gelder', 1),
    ('Cashews', 'box', 7, 'kg', 'Van Gelder', 1),
    ('Red onion sliced fine', 'pack', 1, 'kg', 'Van Gelder', 1),
    ('Red onion sliced fine', 'box', 12, 'kg', 'Van Gelder', 1),
    ('Red cabbage shredded', 'pack', 1.5, 'kg', 'Van Gelder', 1),
    ('Red cabbage shredded', 'box', 3, 'kg', 'Van Gelder', 1),
    ('Coriander', 'kg', 1, 'kg', 'Van Gelder', 1),
    ('Parsley', 'kg', 1, 'kg', 'Van Gelder', 1),
    ('Parsley', 'box', 4, 'kg', 'Van Gelder', 1),
    ('Cucumber', 'box', 12, 'piece', 'Van Gelder', 1),
    ('Sunflower oil', 'bottle', 1, 'l', 'Van Gelder', 1),
    ('Green lentils', 'bag', 10, 'kg', 'Van Gelder', 1),
    ('Carrot julienne', 'pack', 1, 'kg', 'Van Gelder', 1),
    ('Basil', 'pack', 500, 'g', 'Van Gelder', 1),
    ('Mint', 'pack', 75, 'g', 'Van Gelder', 1),
    ('Green chili', 'pack', 500, 'g', 'Van Gelder', 1),
    ('Tomato brunoise', 'box', 6, 'kg', 'Van Gelder', 1),
    ('Eggplant', 'box', 14, 'piece', 'Van Gelder', 1),
    ('Romaine lettuce', 'piece', 1, 'piece', 'Van Gelder', 1),
    ('Pomegranate seeds', 'pack', 1, 'kg', 'Van Gelder', 1),
    ('Garlic puree', 'pack', 1, 'kg', 'Van Gelder', 1),
    ('Eggs', 'box', 90, 'piece', 'Van Gelder', 1),
    ('Garlic peeled', 'pack', 1, 'kg', 'Van Gelder', 1),
    ('Celery brunoise', 'pack', 1, 'kg', 'Van Gelder', 1),
    ('Chickpeas', 'bag', 10, 'kg', 'Van Gelder', 1),
    ('Cucumber brunoise 20mm', 'pack', 1, 'kg', 'Van Gelder', 1),
    ('Cucumber brunoise 20mm', 'box', 6, 'kg', 'Van Gelder', 1),
    ('Red lentils', 'pack', 500, 'g', 'Van Gelder', 1),

    ('Chicken thigh fillet halal', 'tray', 2.5, 'kg', 'Bidfood', 1),
    ('Pita bread 15 cm', 'box', 50, 'piece', 'Bidfood', 1),
    ('Whole wheat pita bread 15 cm', 'box', 50, 'piece', 'Bidfood', 1),
    ('Feta cheese', 'pack', 1.6, 'kg', 'Bidfood', 1),
    ('Greek yoghurt 10%', 'bucket', 1, 'kg', 'Bidfood', 1),
    ('Red split peas', 'bag', 5, 'kg', 'Bidfood', 1),
    ('Tomato puree', 'can', 800, 'g', 'Bidfood', 1),
    ('Oat drink barista', 'pack', 1, 'l', 'Bidfood', 1),
    ('Vanilla extract', 'bottle', 1, 'l', 'Bidfood', 1),
    ('Rice flour', 'box', 10, 'kg', 'Bidfood', 1),
    ('Middle Eastern pickles', 'can', 3, 'kg', 'Bidfood', 1),
    ('Sunflower oil', 'bottle', 5, 'l', 'Bidfood', 1),
    ('Sea salt', 'bucket', 5, 'kg', 'Bidfood', 1),
    ('MSG (Ve Tsin)', 'box', 2, 'kg', 'Bidfood', 1),
    ('Dates pitted', 'bag', 1.35, 'kg', 'Bidfood', 1),
    ('Flaxseed', 'bag', 1, 'kg', 'Bidfood', 1),
    ('Vegetable bouillon', 'pack', 1, 'kg', 'Bidfood', 1),
    ('Eggplant puree', 'can', 2.83, 'kg', 'Bidfood', 1),
    ('Kalamata olives', 'jar', 5.2, 'kg', 'Bidfood', 1),
    ('Lemon juice', 'bottle', 1, 'l', 'Bidfood', 1),
    ('Coca Cola', 'tray', 24, 'piece', 'Bidfood', 1),
    ('Coca Cola Zero', 'tray', 24, 'piece', 'Bidfood', 1),
    ('SOOF Mint', 'tray', 12, 'piece', 'Bidfood', 1),
    ('SOOF Cardamom', 'tray', 12, 'piece', 'Bidfood', 1),
    ('SOOF Lavender', 'tray', 12, 'piece', 'Bidfood', 1),
    ('Sparkling water', 'tray', 18, 'piece', 'Bidfood', 1),
    ('Still water', 'tray', 24, 'piece', 'Bidfood', 1),

    ('Hand soap', 'can', 5, 'l', 'Bidfood', 0),
    ('Napkins', 'pack', 60, 'piece', 'Bidfood', 0),
    ('Straws', 'box', 250, 'piece', 'Bidfood', 0),
    ('Aluminium foil', 'roll', 200, 'm', 'Bidfood', 0),
    ('Cling film', 'box', 4, 'roll', 'Bidfood', 0),
    ('Wooden cutlery', 'box', 250, 'piece', 'Bidfood', 0),
    ('Toilet paper', 'pack', 48, 'piece', 'Bidfood', 0);

  -- Match to existing raw_ingredients for this location
  CREATE TEMP TABLE matched AS
  SELECT
    ri.id AS raw_ingredient_id,
    sr.product,
    sr.content_amount,
    sr.content_unit,
    sr.supplier_name,
    sr.visible,
    ri.unit AS raw_unit
  FROM sheet_rows sr
  JOIN raw_ingredients ri
    ON ri.location_id = loc_id
   AND lower(btrim(ri.name)) = lower(btrim(sr.product));

  -- Report matching quality
  -- (rows are duplicated per ingredient when supplier sheet has multiple pack entries; that's expected)
  -- We'll compute unmatched product names too:
  CREATE TEMP TABLE unmatched AS
  SELECT DISTINCT sr.product
  FROM sheet_rows sr
  LEFT JOIN raw_ingredients ri
    ON ri.location_id = loc_id
   AND lower(btrim(ri.name)) = lower(btrim(sr.product))
  WHERE ri.id IS NULL;

  -- 1) Ensure suppliers exist
  INSERT INTO suppliers (location_id, name)
  SELECT DISTINCT
    loc_id,
    btrim(m.supplier_name)
  FROM matched m
  WHERE m.supplier_name IS NOT NULL
    AND btrim(m.supplier_name) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM suppliers s
      WHERE s.location_id = loc_id
        AND lower(btrim(s.name)) = lower(btrim(m.supplier_name))
    );

  -- 2) Update ingredient_pack_sizes:
  --    normalize piece->pcs, otherwise keep kg/g/l/m as-is
  --    we overwrite all existing pack sizes for matched ingredients
  DELETE FROM ingredient_pack_sizes ips
  WHERE ips.raw_ingredient_id IN (SELECT DISTINCT raw_ingredient_id FROM matched);

  INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
  SELECT
    m.raw_ingredient_id,
    m.content_amount,
    CASE
      WHEN lower(btrim(m.content_unit)) IN ('piece', 'pieces', 'pcs') THEN 'pcs'
      WHEN lower(btrim(m.content_unit)) IN ('kg') THEN 'kg'
      WHEN lower(btrim(m.content_unit)) IN ('g') THEN 'g'
      WHEN lower(btrim(m.content_unit)) IN ('l') THEN 'l'
      WHEN lower(btrim(m.content_unit)) IN ('m') THEN 'm'
      ELSE lower(btrim(m.content_unit))
    END AS normalized_size_unit
  FROM matched m
  WHERE m.visible = 1;

  -- 3) Map supplier_ingredients (preferred by visible)
  -- Aggregate: same raw + supplier can appear on multiple sheet lines (e.g. two pack sizes).
  INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
  SELECT
    s.id AS supplier_id,
    m.raw_ingredient_id,
    bool_or(m.visible = 1) AS is_preferred
  FROM matched m
  JOIN suppliers s
    ON s.location_id = loc_id
   AND lower(btrim(s.name)) = lower(btrim(m.supplier_name))
  GROUP BY s.id, m.raw_ingredient_id
  ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
    SET is_preferred = EXCLUDED.is_preferred,
        updated_at = NOW();

  -- Reports (no SELECT inside DO — PL/pgSQL has no destination for result rows)
  RAISE NOTICE 'Matched ingredient rows: %', (SELECT count(*) FROM matched);
  RAISE NOTICE 'Distinct matched ingredients: %', (SELECT count(DISTINCT raw_ingredient_id) FROM matched);
  RAISE NOTICE 'Unmatched product names: %', (SELECT count(*) FROM unmatched);
  FOR r IN SELECT product FROM unmatched ORDER BY product LOOP
    RAISE NOTICE 'UNMATCHED product (no raw_ingredient with this name): %', r.product;
  END LOOP;

END $$;

-- Result grid: raw ingredients for this location still without any pack size (after sync)
SELECT ri.name, ri.unit
FROM raw_ingredients ri
WHERE ri.location_id = 'ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a'
  AND NOT EXISTS (SELECT 1 FROM ingredient_pack_sizes ips WHERE ips.raw_ingredient_id = ri.id)
ORDER BY ri.name;


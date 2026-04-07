-- Link recipe-seeded raw_ingredient names (014 truncations / Dutch) to supplier sheet product names
-- so 023-style pack sizes + supplier_ingredients apply. Re-runnable.
--
-- Run after 023. Uses same location_id and the same sheet_rows snapshot as 023 (keep in sync when sheet changes).

DO $$
DECLARE
  loc_id UUID := 'ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a';
  r RECORD;
BEGIN
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

  -- db_name = raw_ingredients.name as seeded from recipes; sheet_product = sheet_rows.product
  CREATE TEMP TABLE name_alias (
    db_name TEXT NOT NULL,
    sheet_product TEXT NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO name_alias (db_name, sheet_product) VALUES
    ('Aubergine', 'Eggplant'),
    ('Grilled aube', 'Eggplant'),
    ('Lettuce', 'Romaine lettuce'),
    ('Cucumbers', 'Cucumber'),
    ('Fresh corian', 'Coriander'),
    ('Fresh parsle', 'Parsley'),
    ('Cut parsley', 'Parsley'),
    ('Chopped par', 'Parsley'),
    ('White onion', 'Onion peeled'),
    ('Garlic', 'Garlic peeled'),
    ('Fresh garlic', 'Garlic peeled'),
    ('Carrots', 'Carrot julienne'),
    ('Celery', 'Celery brunoise'),
    ('Tomato past', 'Tomato puree'),
    ('Diced tomat', 'Tomato brunoise'),
    ('Tomatoes cubed - 1kg', 'Tomato brunoise'),
    ('Sunflower oi', 'Sunflower oil'),
    ('Neutral oil', 'Sunflower oil'),
    ('Olive oil', 'Sunflower oil'),
    ('Salt', 'Sea salt'),
    ('Ve Tsin', 'MSG (Ve Tsin)'),
    ('Stock bouillon', 'Vegetable bouillon'),
    ('Stock cubes', 'Vegetable bouillon'),
    ('Vegetable st', 'Vegetable bouillon'),
    ('Red lentlls', 'Red lentils'),
    ('Lentils', 'Green lentils'),
    ('Chicken thigf', 'Chicken thigh fillet halal'),
    ('Coca Cola regular', 'Coca Cola'),
    ('SOOF Cardemom', 'SOOF Cardamom'),
    ('SOOF Munt', 'SOOF Mint'),
    ('Yoghurt', 'Greek yoghurt 10%'),
    ('Pomegrana', 'Pomegranate seeds'),
    ('Soaked chick', 'Chickpeas'),
    ('Cooked chick', 'Chickpeas'),
    ('Flatbread', 'Pita bread 15 cm'),
    ('Ground flax', 'Flaxseed broken'),
    ('Cacan', 'Cashews'),
    ('Birds eye chi', 'Green chili'),
    ('Chili pepper', 'Green chili'),
    ('Green jalape', 'Green chili'),
    ('Vanilla extra', 'Vanilla extract'),
    ('Water', 'Still water'),
    ('Hot water', 'Still water'),
    ('MSM flat', 'Still water'),
    ('MSM Sparkling', 'Sparkling water');
  -- "All purpose f" etc.: no safe sheet row — backfill 1 kg; fix name/pack in Admin when you have the real SKU.

  -- All matching sheet rows per ingredient (e.g. sunflower 1 L + 5 L). Ordering needs every pack option.
  -- Stocktake uses raw_ingredients.unit (g/ml) in the app; packs are for ordering / box counting (grams_per_piece).
  CREATE TEMP TABLE matched_alias AS
  SELECT
    ri.id AS raw_ingredient_id,
    sr.product,
    sr.content_amount,
    sr.content_unit,
    sr.supplier_name,
    sr.visible,
    ri.unit AS raw_unit
  FROM raw_ingredients ri
  JOIN name_alias na
    ON ri.location_id = loc_id
   AND lower(btrim(ri.name)) = lower(btrim(na.db_name))
  JOIN sheet_rows sr
    ON lower(btrim(sr.product)) = lower(btrim(na.sheet_product));

  RAISE NOTICE 'Alias-matched sheet rows (may be >1 per ingredient): %', (SELECT count(*) FROM matched_alias);

  INSERT INTO suppliers (location_id, name)
  SELECT DISTINCT
    loc_id,
    btrim(m.supplier_name)
  FROM matched_alias m
  WHERE m.supplier_name IS NOT NULL
    AND btrim(m.supplier_name) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM suppliers s
      WHERE s.location_id = loc_id
        AND lower(btrim(s.name)) = lower(btrim(m.supplier_name))
    );

  DELETE FROM ingredient_pack_sizes ips
  WHERE ips.raw_ingredient_id IN (SELECT raw_ingredient_id FROM matched_alias);

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
    END
  FROM matched_alias m
  WHERE m.visible = 1;

  -- One row per (supplier, raw): same supplier can appear on multiple sheet lines (e.g. 1 L + 5 L oil).
  INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
  SELECT
    s.id,
    m.raw_ingredient_id,
    bool_or(m.visible = 1) AS is_preferred
  FROM matched_alias m
  JOIN suppliers s
    ON s.location_id = loc_id
   AND lower(btrim(s.name)) = lower(btrim(m.supplier_name))
  GROUP BY s.id, m.raw_ingredient_id
  ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
    SET is_preferred = EXCLUDED.is_preferred,
        updated_at = NOW();

  -- Fallback: still no pack → 1 kg (g) or 1 pcs for ordering / Admin (stocktake uses recipe unit g/ml in app)
  INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
  SELECT ri.id, 1, 'kg'
  FROM raw_ingredients ri
  WHERE ri.location_id = loc_id
    AND lower(btrim(COALESCE(ri.unit, ''))) IN ('g', 'kg')
    AND NOT EXISTS (SELECT 1 FROM ingredient_pack_sizes ips WHERE ips.raw_ingredient_id = ri.id);

  INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
  SELECT ri.id, 1, 'pcs'
  FROM raw_ingredients ri
  WHERE ri.location_id = loc_id
    AND lower(btrim(COALESCE(ri.unit, ''))) = 'pcs'
    AND NOT EXISTS (SELECT 1 FROM ingredient_pack_sizes ips WHERE ips.raw_ingredient_id = ri.id);

  -- ml/l left without pack if any (optional 1 L default)
  INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
  SELECT ri.id, 1, 'l'
  FROM raw_ingredients ri
  WHERE ri.location_id = loc_id
    AND lower(btrim(COALESCE(ri.unit, ''))) IN ('l', 'ml')
    AND NOT EXISTS (SELECT 1 FROM ingredient_pack_sizes ips WHERE ips.raw_ingredient_id = ri.id);

END $$;

-- Should be empty or only edge cases after alias + backfill
SELECT ri.name, ri.unit
FROM raw_ingredients ri
WHERE ri.location_id = 'ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a'
  AND NOT EXISTS (SELECT 1 FROM ingredient_pack_sizes ips WHERE ips.raw_ingredient_id = ri.id)
ORDER BY ri.name;

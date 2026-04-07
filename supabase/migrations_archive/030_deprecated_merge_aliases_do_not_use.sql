-- After 028, recipe-seed names (014) can still exist next to master names.
-- This merges old_id -> canonical_id for the same location, then deletes the duplicate row.
-- Re-runnable: no-op when old row is already gone.
--
-- Add rows to name_map if you find more duplicates in Admin / stocktake.

DO $$
DECLARE
  loc_id UUID := 'ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a';
BEGIN
  CREATE TEMP TABLE name_map (
    old_name TEXT NOT NULL,
    canonical_name TEXT NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO name_map (old_name, canonical_name) VALUES
    ('Baking powd', 'Baking powder'),
    ('All purpose f', 'All purpose flour'),
    ('Ground pepp', 'Black pepper'),
    ('Fresh corian', 'Coriander'),
    ('Fresh parsle', 'Parsley'),
    ('Cut parsley', 'Parsley'),
    ('Chopped par', 'Parsley'),
    ('Sunflower oi', 'Sunflower oil'),
    ('Chicken thigf', 'Chicken'),
    ('Diced tomat', 'Tomato'),
    ('Tomatoes mix', 'Tomato'),
    ('Tomatoes cubed - 1kg', 'Tomato'),
    ('White onion', 'Onion peeled'),
    ('White sugar', 'Sugar white'),
    ('Brown sugar', 'Sugar brown'),
    ('Red lentlls', 'Red lentils'),
    ('Vegetable st', 'Stock'),
    ('Stock bouillon', 'Stock'),
    ('Stock cubes', 'Stock'),
    ('Vanilla extra', 'Vanilla extract'),
    ('Tomato past', 'Tomato puree'),
    ('Coca Cola regular', 'Coca Cola'),
    ('SOOF Cardemom', 'SOOF Cardamom'),
    ('SOOF Munt', 'SOOF Mint');

  CREATE TEMP TABLE resolved_map AS
  SELECT
    old_ri.id AS old_id,
    new_ri.id AS new_id
  FROM name_map nm
  JOIN raw_ingredients old_ri
    ON old_ri.location_id = loc_id
   AND lower(btrim(old_ri.name)) = lower(btrim(nm.old_name))
  JOIN raw_ingredients new_ri
    ON new_ri.location_id = loc_id
   AND lower(btrim(new_ri.name)) = lower(btrim(nm.canonical_name))
  WHERE old_ri.id <> new_ri.id;

  UPDATE prep_item_ingredients pii
  SET raw_ingredient_id = rm.new_id,
      updated_at = NOW()
  FROM resolved_map rm
  WHERE pii.raw_ingredient_id = rm.old_id
    AND NOT EXISTS (
      SELECT 1
      FROM prep_item_ingredients x
      WHERE x.prep_item_id = pii.prep_item_id
        AND x.raw_ingredient_id = rm.new_id
    );

  DELETE FROM prep_item_ingredients pii
  USING resolved_map rm
  WHERE pii.raw_ingredient_id = rm.old_id
    AND EXISTS (
      SELECT 1
      FROM prep_item_ingredients x
      WHERE x.prep_item_id = pii.prep_item_id
        AND x.raw_ingredient_id = rm.new_id
    );

  CREATE TEMP TABLE stock_merge AS
  SELECT
    dsc.location_id,
    dsc.date,
    rm.new_id AS raw_ingredient_id,
    SUM(dsc.quantity) AS quantity
  FROM daily_stock_counts dsc
  JOIN resolved_map rm ON dsc.raw_ingredient_id = rm.old_id
  GROUP BY dsc.location_id, dsc.date, rm.new_id;

  DELETE FROM daily_stock_counts dsc
  USING resolved_map rm
  WHERE dsc.raw_ingredient_id = rm.old_id;

  INSERT INTO daily_stock_counts (location_id, date, raw_ingredient_id, quantity)
  SELECT location_id, date, raw_ingredient_id, quantity
  FROM stock_merge
  ON CONFLICT (location_id, date, raw_ingredient_id) DO UPDATE
    SET quantity = daily_stock_counts.quantity + EXCLUDED.quantity,
        updated_at = NOW();

  UPDATE supplier_ingredients si
  SET raw_ingredient_id = rm.new_id,
      updated_at = NOW()
  FROM resolved_map rm
  WHERE si.raw_ingredient_id = rm.old_id
    AND NOT EXISTS (
      SELECT 1
      FROM supplier_ingredients x
      WHERE x.supplier_id = si.supplier_id
        AND x.raw_ingredient_id = rm.new_id
    );

  DELETE FROM supplier_ingredients si
  USING resolved_map rm
  WHERE si.raw_ingredient_id = rm.old_id
    AND EXISTS (
      SELECT 1
      FROM supplier_ingredients x
      WHERE x.supplier_id = si.supplier_id
        AND x.raw_ingredient_id = rm.new_id
    );

  UPDATE order_line_items oli
  SET raw_ingredient_id = rm.new_id
  FROM resolved_map rm
  WHERE oli.raw_ingredient_id = rm.old_id;

  DELETE FROM raw_ingredients ri
  USING resolved_map rm
  WHERE ri.id = rm.old_id
    AND ri.location_id = loc_id;
END $$;

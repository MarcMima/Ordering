-- Reconcile raw ingredients + foolproof supplier linking (bulk helper)
--
-- Why:
-- - After multiple imports you may have duplicate/alias ingredient names
--   (e.g. "Baking powd" and "Baking powder").
-- - Recipes (prep_item_ingredients) might still point to old aliases.
-- - Suppliers may exist but not be linked to all raw ingredients.
--
-- What this script does:
-- 1) Optional alias merge: move FK usage from old raw name -> canonical raw name
--    across prep_item_ingredients, daily_stock_counts, supplier_ingredients.
-- 2) Optional supplier links: upsert preferred supplier per raw ingredient.
-- 3) Report rows that are still unlinked to any preferred supplier.
--
-- Safe to re-run.

DO $$
DECLARE
  loc_id UUID := 'ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a';
BEGIN
  ------------------------------------------------------------------------------
  -- A) OPTIONAL: alias -> canonical name mapping
  -- Fill rows you want to merge. Keep empty if not needed.
  ------------------------------------------------------------------------------
  CREATE TEMP TABLE name_map (
    old_name TEXT NOT NULL,
    canonical_name TEXT NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO name_map (old_name, canonical_name) VALUES
    ('Baking powd', 'Baking powder'),
    ('All purpose f', 'All purpose flour');
    -- Add more rows as needed:
    -- ('Ground pepp', 'Black pepper'),
    -- ('Fresh corian', 'Koriander');

  -- Merge references from old -> canonical where both exist in this location.
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

  -- prep_item_ingredients: move references and merge collisions
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

  -- daily_stock_counts: move references and merge (sum) duplicates per date/location
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

  -- supplier_ingredients: move references and merge collisions
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

  -- delete old raw rows after migration of refs (only in this location)
  DELETE FROM raw_ingredients ri
  USING resolved_map rm
  WHERE ri.id = rm.old_id
    AND ri.location_id = loc_id;

  ------------------------------------------------------------------------------
  -- B) OPTIONAL: supplier linking mapping (raw -> supplier)
  -- Fill supplier_name per raw_name. This upserts preferred links.
  ------------------------------------------------------------------------------
  CREATE TEMP TABLE supplier_map (
    raw_name TEXT NOT NULL,
    supplier_name TEXT NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO supplier_map (raw_name, supplier_name) VALUES
    ('All purpose flour', 'Your Supplier A'),
    ('Baking powder', 'Your Supplier A');
    -- Add more rows:
    -- ('Aubergine', 'Fresh Supplier'),
    -- ('Lemon juice', 'Dry Goods Supplier');

  -- Ensure suppliers exist
  INSERT INTO suppliers (location_id, name)
  SELECT DISTINCT loc_id, btrim(sm.supplier_name)
  FROM supplier_map sm
  WHERE btrim(sm.supplier_name) <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM suppliers s
      WHERE s.location_id = loc_id
        AND lower(btrim(s.name)) = lower(btrim(sm.supplier_name))
    );

  -- Upsert preferred links
  INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
  SELECT
    s.id,
    ri.id,
    true
  FROM supplier_map sm
  JOIN suppliers s
    ON s.location_id = loc_id
   AND lower(btrim(s.name)) = lower(btrim(sm.supplier_name))
  JOIN raw_ingredients ri
    ON ri.location_id = loc_id
   AND lower(btrim(ri.name)) = lower(btrim(sm.raw_name))
  ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
    SET is_preferred = true,
        updated_at = NOW();

END $$;

-- ------------------------------------------------------------------------------
-- Reports
-- ------------------------------------------------------------------------------
-- 1) Raw ingredients in this location without any preferred supplier link
SELECT ri.id, ri.name, ri.unit
FROM raw_ingredients ri
WHERE ri.location_id = 'ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a'
  AND NOT EXISTS (
    SELECT 1
    FROM supplier_ingredients si
    WHERE si.raw_ingredient_id = ri.id
      AND si.is_preferred = true
  )
ORDER BY ri.name;

-- 2) Current recipe row counts per prep item (sanity check)
SELECT p.name AS prep_item, count(*) AS ingredient_rows
FROM prep_item_ingredients pii
JOIN prep_items p ON p.id = pii.prep_item_id
GROUP BY p.name
ORDER BY p.name;


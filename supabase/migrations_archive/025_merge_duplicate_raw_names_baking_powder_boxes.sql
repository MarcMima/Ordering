-- 1) grams_per_piece: count stock in boxes/pieces while raw_ingredients.unit stays g (recipes unchanged).
-- 2) Merge duplicate raw rows (Baking powd → Baking powder) and rename truncations (All purpose f → All purpose flour).
-- 3) Baking powder: one pack row = 1 box, default 500 g/box (edit in DB if your pack size differs).

ALTER TABLE ingredient_pack_sizes
  ADD COLUMN IF NOT EXISTS grams_per_piece NUMERIC NULL;

COMMENT ON COLUMN ingredient_pack_sizes.grams_per_piece IS
  'If size_unit is pcs/piece and the raw ingredient is tracked in g: grams per piece (e.g. one retail box). Stocktake can show boxes; quantity stored as g.';

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
    ('All purpose f', 'All purpose flour');

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

  DELETE FROM raw_ingredients ri
  USING resolved_map rm
  WHERE ri.id = rm.old_id
    AND ri.location_id = loc_id;

  -- Rename-only when the canonical row does not exist yet
  UPDATE raw_ingredients ri
  SET name = 'Baking powder',
      updated_at = NOW()
  WHERE ri.location_id = loc_id
    AND lower(btrim(ri.name)) = 'baking powd'
    AND NOT EXISTS (
      SELECT 1 FROM raw_ingredients x
      WHERE x.location_id = loc_id
        AND x.id <> ri.id
        AND lower(btrim(x.name)) = 'baking powder'
    );

  UPDATE raw_ingredients ri
  SET name = 'All purpose flour',
      updated_at = NOW()
  WHERE ri.location_id = loc_id
    AND lower(btrim(ri.name)) = 'all purpose f'
    AND NOT EXISTS (
      SELECT 1 FROM raw_ingredients x
      WHERE x.location_id = loc_id
        AND x.id <> ri.id
        AND lower(btrim(x.name)) = 'all purpose flour'
    );

  -- Baking powder: stocktake in boxes (adjust grams_per_piece to your real pack size)
  DELETE FROM ingredient_pack_sizes ips
  USING raw_ingredients ri
  WHERE ips.raw_ingredient_id = ri.id
    AND ri.location_id = loc_id
    AND lower(btrim(ri.name)) = 'baking powder';

  INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, grams_per_piece)
  SELECT ri.id, 1, 'pcs', 500
  FROM raw_ingredients ri
  WHERE ri.location_id = loc_id
    AND lower(btrim(ri.name)) = 'baking powder';
END $$;

-- Keep locations in sync by copying operational catalog setup from one location
-- to one or more target locations.
--
-- Workflow:
-- 1) Initial rollout: copy current main location -> Mima Pijp, Mima Zuidas, Mima TEST
-- 2) Ongoing: build in Mima TEST, then run function to sync TEST -> other locations

CREATE OR REPLACE FUNCTION public.sync_location_setup(
  source_location_name TEXT,
  target_location_name TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  src_id UUID;
  tgt_id UUID;
  src_name TEXT;
  dyn_cols TEXT;
BEGIN
  SELECT id, name
  INTO src_id, src_name
  FROM locations
  WHERE lower(btrim(name)) = lower(btrim(source_location_name))
  LIMIT 1;

  SELECT id
  INTO tgt_id
  FROM locations
  WHERE lower(btrim(name)) = lower(btrim(target_location_name))
  LIMIT 1;

  IF src_id IS NULL THEN
    RAISE EXCEPTION 'Source location not found: %', source_location_name;
  END IF;
  IF tgt_id IS NULL THEN
    RAISE EXCEPTION 'Target location not found: %', target_location_name;
  END IF;
  IF src_id = tgt_id THEN
    RETURN;
  END IF;

  -- 0) Copy location-level settings from source to target (except id/name/timestamps).
  SELECT string_agg(format('%I = s.%I', column_name, column_name), ', ')
  INTO dyn_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'locations'
    AND column_name NOT IN ('id', 'name', 'created_at', 'updated_at');

  IF dyn_cols IS NOT NULL THEN
    EXECUTE format(
      'UPDATE locations t SET %s, updated_at = NOW()
       FROM locations s
       WHERE t.id = $1 AND s.id = $2',
      dyn_cols
    )
    USING tgt_id, src_id;
  END IF;

  -- 1) Suppliers (upsert by name within target location).
  INSERT INTO suppliers (
    id,
    location_id,
    name,
    contact_info,
    contact_email,
    minimum_order_value
  )
  SELECT
    gen_random_uuid(),
    tgt_id,
    s.name,
    s.contact_info,
    s.contact_email,
    s.minimum_order_value
  FROM suppliers s
  WHERE s.location_id = src_id
    AND NOT EXISTS (
      SELECT 1
      FROM suppliers st
      WHERE st.location_id = tgt_id
        AND lower(btrim(st.name)) = lower(btrim(s.name))
    );

  -- 2) Raw ingredients (upsert by name within target location), preserving settings.
  SELECT string_agg(format('%I', column_name), ', ')
  INTO dyn_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'raw_ingredients'
    AND column_name NOT IN ('id', 'location_id', 'created_at', 'updated_at');

  IF dyn_cols IS NULL THEN
    RAISE EXCEPTION 'Could not determine raw_ingredients columns for sync';
  END IF;

  EXECUTE format(
    'INSERT INTO raw_ingredients (id, location_id, %1$s)
     SELECT gen_random_uuid(), $1, %1$s
     FROM raw_ingredients r
     WHERE r.location_id = $2
       AND NOT EXISTS (
         SELECT 1
         FROM raw_ingredients rt
         WHERE rt.location_id = $1
           AND lower(btrim(rt.name)) = lower(btrim(r.name))
       )',
    dyn_cols
  )
  USING tgt_id, src_id;

  -- 3) Replace location_prep_items target set with source set (exact per prep item + settings).
  DELETE FROM location_prep_items
  WHERE location_id = tgt_id;

  SELECT string_agg(format('%I', column_name), ', ')
  INTO dyn_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'location_prep_items'
    AND column_name NOT IN ('id', 'location_id', 'prep_item_id', 'created_at', 'updated_at');

  IF dyn_cols IS NULL THEN
    INSERT INTO location_prep_items (id, location_id, prep_item_id)
    SELECT gen_random_uuid(), tgt_id, lpi.prep_item_id
    FROM location_prep_items lpi
    WHERE lpi.location_id = src_id
    ON CONFLICT (location_id, prep_item_id) DO NOTHING;
  ELSE
    EXECUTE format(
      'INSERT INTO location_prep_items (id, location_id, prep_item_id, %1$s)
       SELECT gen_random_uuid(), $1, lpi.prep_item_id, %1$s
       FROM location_prep_items lpi
       WHERE lpi.location_id = $2
       ON CONFLICT (location_id, prep_item_id) DO UPDATE
       SET %2$s',
      dyn_cols,
      (
        SELECT string_agg(format('%1$I = EXCLUDED.%1$I', c.column_name), ', ')
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = 'location_prep_items'
          AND c.column_name NOT IN ('id', 'location_id', 'prep_item_id', 'created_at', 'updated_at')
      )
    )
    USING tgt_id, src_id;
  END IF;

  -- 4) Ingredient pack sizes (mapped by raw ingredient name).
  DELETE FROM ingredient_pack_sizes ips
  USING raw_ingredients rt
  WHERE ips.raw_ingredient_id = rt.id
    AND rt.location_id = tgt_id;

  SELECT string_agg(format('%I', column_name), ', ')
  INTO dyn_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'ingredient_pack_sizes'
    AND column_name NOT IN ('id', 'raw_ingredient_id', 'created_at', 'updated_at');

  IF dyn_cols IS NULL THEN
    RAISE EXCEPTION 'Could not determine ingredient_pack_sizes columns for sync';
  END IF;

  EXECUTE format(
    'INSERT INTO ingredient_pack_sizes (id, raw_ingredient_id, %1$s)
     SELECT
       gen_random_uuid(),
       rt.id,
       %1$s
     FROM ingredient_pack_sizes ips
     JOIN raw_ingredients rs ON rs.id = ips.raw_ingredient_id
     JOIN raw_ingredients rt
       ON rt.location_id = $1
      AND lower(btrim(rt.name)) = lower(btrim(rs.name))
     WHERE rs.location_id = $2',
    dyn_cols
  )
  USING tgt_id, src_id;

  -- 5) Supplier delivery schedules (mapped by supplier name).
  DELETE FROM supplier_delivery_schedules
  WHERE location_id = tgt_id;

  SELECT string_agg(format('%I', column_name), ', ')
  INTO dyn_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'supplier_delivery_schedules'
    AND column_name NOT IN ('id', 'supplier_id', 'location_id', 'created_at', 'updated_at');

  IF dyn_cols IS NULL THEN
    INSERT INTO supplier_delivery_schedules (id, supplier_id, location_id)
    SELECT
      gen_random_uuid(),
      st.id,
      tgt_id
    FROM supplier_delivery_schedules sds
    JOIN suppliers ss ON ss.id = sds.supplier_id
    JOIN suppliers st
      ON st.location_id = tgt_id
     AND lower(btrim(st.name)) = lower(btrim(ss.name))
    WHERE sds.location_id = src_id;
  ELSE
    EXECUTE format(
      'INSERT INTO supplier_delivery_schedules (id, supplier_id, location_id, %1$s)
       SELECT
         gen_random_uuid(),
         st.id,
         $1,
         %1$s
       FROM supplier_delivery_schedules sds
       JOIN suppliers ss ON ss.id = sds.supplier_id
       JOIN suppliers st
         ON st.location_id = $1
        AND lower(btrim(st.name)) = lower(btrim(ss.name))
       WHERE sds.location_id = $2',
      dyn_cols
    )
    USING tgt_id, src_id;
  END IF;

  -- 6) Supplier ingredients (mapped by supplier + raw ingredient names).
  DELETE FROM supplier_ingredients si
  USING suppliers st, raw_ingredients rt
  WHERE si.supplier_id = st.id
    AND si.raw_ingredient_id = rt.id
    AND st.location_id = tgt_id
    AND rt.location_id = tgt_id;

  SELECT string_agg(format('%I', column_name), ', ')
  INTO dyn_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'supplier_ingredients'
    AND column_name NOT IN ('id', 'supplier_id', 'raw_ingredient_id', 'created_at', 'updated_at');

  IF dyn_cols IS NULL THEN
    INSERT INTO supplier_ingredients (id, supplier_id, raw_ingredient_id)
    SELECT
      gen_random_uuid(),
      st.id,
      rt.id
    FROM supplier_ingredients sis
    JOIN suppliers ss ON ss.id = sis.supplier_id
    JOIN raw_ingredients rs ON rs.id = sis.raw_ingredient_id
    JOIN suppliers st
      ON st.location_id = tgt_id
     AND lower(btrim(st.name)) = lower(btrim(ss.name))
    JOIN raw_ingredients rt
      ON rt.location_id = tgt_id
     AND lower(btrim(rt.name)) = lower(btrim(rs.name))
    WHERE ss.location_id = src_id
      AND rs.location_id = src_id;
  ELSE
    EXECUTE format(
      'INSERT INTO supplier_ingredients (id, supplier_id, raw_ingredient_id, %1$s)
       SELECT
         gen_random_uuid(),
         st.id,
         rt.id,
         %1$s
       FROM supplier_ingredients sis
       JOIN suppliers ss ON ss.id = sis.supplier_id
       JOIN raw_ingredients rs ON rs.id = sis.raw_ingredient_id
       JOIN suppliers st
         ON st.location_id = $1
        AND lower(btrim(st.name)) = lower(btrim(ss.name))
       JOIN raw_ingredients rt
         ON rt.location_id = $1
        AND lower(btrim(rt.name)) = lower(btrim(rs.name))
       WHERE ss.location_id = $2
         AND rs.location_id = $2',
      dyn_cols
    )
    USING tgt_id, src_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.sync_location_setup(TEXT, TEXT) IS
  'Copies location-scoped operational setup from source location to target location. Run after validating changes in Mima TEST.';

-- Initial rollout: seed the three new locations from the first existing non-new location.
DO $$
DECLARE
  bootstrap_source_name TEXT;
BEGIN
  SELECT name
  INTO bootstrap_source_name
  FROM locations
  WHERE lower(btrim(name)) NOT IN ('mima pijp', 'mima zuidas', 'mima test')
  ORDER BY created_at ASC, name ASC
  LIMIT 1;

  IF bootstrap_source_name IS NULL THEN
    -- If there is no legacy/main location, do nothing.
    RETURN;
  END IF;

  PERFORM public.sync_location_setup(bootstrap_source_name, 'Mima Pijp');
  PERFORM public.sync_location_setup(bootstrap_source_name, 'Mima Zuidas');
  PERFORM public.sync_location_setup(bootstrap_source_name, 'Mima TEST');
END $$;

-- Future workflow example (run manually when TEST is approved):
-- SELECT public.sync_location_setup('Mima TEST', 'Mima Pijp');
-- SELECT public.sync_location_setup('Mima TEST', 'Mima Zuidas');

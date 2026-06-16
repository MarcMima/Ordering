-- 130: Force Zuidas setup to match the strongest Van Gelder source location.
-- Rationale: name-based source selection can pick the wrong location, leaving
-- Zuidas with only partial VG mappings (e.g. only one add-item option).

DO $$
DECLARE
  zuidas_id UUID;
  zuidas_name TEXT;
  src_location_id UUID;
  src_location_name TEXT;
  src_vg_supplier_id UUID;
  zuidas_vg_supplier_id UUID;
BEGIN
  -- Locate Zuidas reliably.
  SELECT id, name
  INTO zuidas_id, zuidas_name
  FROM locations
  WHERE lower(btrim(name)) IN ('mima zuidas', 'zuidas', 'mima zuid')
     OR lower(name) LIKE '%zuidas%'
     OR lower(name) LIKE '% zuid%'
  ORDER BY
    CASE WHEN lower(btrim(name)) IN ('mima zuidas', 'zuidas') THEN 1 ELSE 2 END,
    name
  LIMIT 1;

  IF zuidas_id IS NULL THEN
    RAISE EXCEPTION 'Could not find Zuidas location.';
  END IF;

  -- Pick source location with the richest VG mapping set.
  SELECT x.location_id, x.location_name
  INTO src_location_id, src_location_name
  FROM (
    SELECT
      l.id AS location_id,
      l.name AS location_name,
      COUNT(si.id)::INT AS vg_mapping_count,
      COUNT(DISTINCT lpi.prep_item_id)::INT AS prep_item_count
    FROM locations l
    JOIN suppliers s
      ON s.location_id = l.id
     AND lower(btrim(s.name)) = 'van gelder'
    LEFT JOIN supplier_ingredients si
      ON si.supplier_id = s.id
    LEFT JOIN location_prep_items lpi
      ON lpi.location_id = l.id
    WHERE l.id <> zuidas_id
      AND lower(l.name) NOT LIKE '%test%'
    GROUP BY l.id, l.name
    ORDER BY vg_mapping_count DESC, prep_item_count DESC, l.name
    LIMIT 1
  ) x;

  IF src_location_id IS NULL THEN
    RAISE EXCEPTION 'No suitable source location with Van Gelder mappings found.';
  END IF;

  -- 1) Full operational sync (raws, packs, suppliers, schedules, mappings, etc.).
  PERFORM public.sync_location_setup(src_location_name, zuidas_name);

  -- 2) Extra guard: explicitly copy VG mappings by raw name once more.
  SELECT id INTO src_vg_supplier_id
  FROM suppliers
  WHERE location_id = src_location_id
    AND lower(btrim(name)) = 'van gelder'
  LIMIT 1;

  SELECT id INTO zuidas_vg_supplier_id
  FROM suppliers
  WHERE location_id = zuidas_id
    AND lower(btrim(name)) = 'van gelder'
  LIMIT 1;

  IF src_vg_supplier_id IS NULL OR zuidas_vg_supplier_id IS NULL THEN
    RAISE NOTICE 'VG supplier missing on source or Zuidas; skipping explicit VG copy.';
    RETURN;
  END IF;

  -- Ensure all source VG raws exist by name on Zuidas.
  INSERT INTO raw_ingredients (
    location_id, name, unit, order_interval_days, stocktake_visible, stocktake_day_of_week,
    stocktake_unit_label, stocktake_content_amount, stocktake_content_unit, stocktake_display_order
  )
  SELECT
    zuidas_id,
    rs.name,
    rs.unit,
    rs.order_interval_days,
    rs.stocktake_visible,
    rs.stocktake_day_of_week,
    rs.stocktake_unit_label,
    rs.stocktake_content_amount,
    rs.stocktake_content_unit,
    rs.stocktake_display_order
  FROM supplier_ingredients sis
  JOIN raw_ingredients rs ON rs.id = sis.raw_ingredient_id
  WHERE sis.supplier_id = src_vg_supplier_id
    AND rs.location_id = src_location_id
    AND NOT EXISTS (
      SELECT 1
      FROM raw_ingredients rz
      WHERE rz.location_id = zuidas_id
        AND lower(btrim(rz.name)) = lower(btrim(rs.name))
    );

  -- Copy/refresh VG supplier_ingredients from source -> Zuidas by raw name.
  INSERT INTO supplier_ingredients (
    supplier_id,
    raw_ingredient_id,
    supplier_sku,
    is_preferred,
    ean_code,
    supplier_article_code,
    supplier_article_name,
    order_unit,
    order_unit_size,
    notes
  )
  SELECT
    zuidas_vg_supplier_id,
    rz.id,
    sis.supplier_sku,
    sis.is_preferred,
    sis.ean_code,
    sis.supplier_article_code,
    sis.supplier_article_name,
    sis.order_unit,
    sis.order_unit_size,
    sis.notes
  FROM supplier_ingredients sis
  JOIN raw_ingredients rs
    ON rs.id = sis.raw_ingredient_id
   AND rs.location_id = src_location_id
  JOIN raw_ingredients rz
    ON rz.location_id = zuidas_id
   AND lower(btrim(rz.name)) = lower(btrim(rs.name))
  WHERE sis.supplier_id = src_vg_supplier_id
  ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
  SET
    supplier_sku = EXCLUDED.supplier_sku,
    is_preferred = EXCLUDED.is_preferred,
    ean_code = EXCLUDED.ean_code,
    supplier_article_code = EXCLUDED.supplier_article_code,
    supplier_article_name = EXCLUDED.supplier_article_name,
    order_unit = EXCLUDED.order_unit,
    order_unit_size = EXCLUDED.order_unit_size,
    notes = EXCLUDED.notes,
    updated_at = NOW();
END $$;

-- 127: Seed/refresh GeDe supplier mappings for Zuidas from the
-- non-Zuidas location with the most GeDe supplier_ingredient rows.

DO $$
DECLARE
  zuidas_location_id UUID;
  src_location_id UUID;
  zuidas_gede_supplier_id UUID;
BEGIN
  SELECT id
  INTO zuidas_location_id
  FROM locations
  WHERE lower(btrim(name)) IN ('mima zuidas', 'zuidas', 'mima zuid')
     OR lower(name) LIKE '%zuidas%'
     OR lower(name) LIKE '% zuid%'
  ORDER BY
    CASE WHEN lower(btrim(name)) IN ('mima zuidas', 'zuidas') THEN 1 ELSE 2 END,
    name
  LIMIT 1;

  IF zuidas_location_id IS NULL THEN
    RAISE EXCEPTION 'Could not find Zuidas location.';
  END IF;

  SELECT src.location_id
  INTO src_location_id
  FROM (
    SELECT
      s.location_id,
      COUNT(*)::INT AS mapping_count
    FROM suppliers s
    JOIN supplier_ingredients si ON si.supplier_id = s.id
    WHERE lower(btrim(s.name)) IN ('gédé', 'gedé')
      AND s.location_id <> zuidas_location_id
    GROUP BY s.location_id
    ORDER BY mapping_count DESC
    LIMIT 1
  ) src;

  IF src_location_id IS NULL THEN
    RAISE NOTICE 'No non-Zuidas GeDe source mappings found; skipping GeDe seed.';
    RETURN;
  END IF;

  -- Ensure GeDe supplier exists on Zuidas (copy contact fields from source).
  INSERT INTO suppliers (name, location_id, contact_email, contact_info, minimum_order_value)
  SELECT
    ss.name,
    zuidas_location_id,
    ss.contact_email,
    ss.contact_info,
    ss.minimum_order_value
  FROM suppliers ss
  WHERE ss.location_id = src_location_id
    AND lower(btrim(ss.name)) IN ('gédé', 'gedé')
    AND NOT EXISTS (
      SELECT 1
      FROM suppliers sz
      WHERE sz.location_id = zuidas_location_id
        AND lower(btrim(sz.name)) IN ('gédé', 'gedé')
    );

  SELECT s.id
  INTO zuidas_gede_supplier_id
  FROM suppliers s
  WHERE s.location_id = zuidas_location_id
    AND lower(btrim(s.name)) IN ('gédé', 'gedé')
  LIMIT 1;

  IF zuidas_gede_supplier_id IS NULL THEN
    RAISE NOTICE 'GeDe supplier missing on Zuidas after seed; skipping mappings.';
    RETURN;
  END IF;

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
    zuidas_gede_supplier_id,
    rz.id,
    si_src.supplier_sku,
    si_src.is_preferred,
    si_src.ean_code,
    si_src.supplier_article_code,
    si_src.supplier_article_name,
    si_src.order_unit,
    si_src.order_unit_size,
    si_src.notes
  FROM suppliers s_src
  JOIN supplier_ingredients si_src ON si_src.supplier_id = s_src.id
  JOIN raw_ingredients r_src ON r_src.id = si_src.raw_ingredient_id
  JOIN raw_ingredients rz
    ON rz.location_id = zuidas_location_id
   AND lower(btrim(rz.name)) = lower(btrim(r_src.name))
  WHERE s_src.location_id = src_location_id
    AND lower(btrim(s_src.name)) IN ('gédé', 'gedé')
    AND r_src.location_id = src_location_id
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

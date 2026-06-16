-- 126: immediate access + Van Gelder availability fixes
-- 1) Ensure abdulhadi@mimafood.nl has admin role (settings.manage included)
-- 2) Ensure this user can access all locations
-- 3) Seed/refresh Zuidas Van Gelder mappings from the non-Zuidas location
--    with the most Van Gelder supplier_ingredient rows.

DO $$
DECLARE
  hadi_id UUID;
  admin_role_id UUID;
  zuidas_location_id UUID;
  src_location_id UUID;
  zuidas_vg_supplier_id UUID;
BEGIN
  -- 1) Admin role for Abdulhadi
  SELECT id
  INTO hadi_id
  FROM auth.users
  WHERE lower(email) = 'abdulhadi@mimafood.nl'
  LIMIT 1;

  SELECT id
  INTO admin_role_id
  FROM roles
  WHERE key = 'admin'
  LIMIT 1;

  IF hadi_id IS NOT NULL AND admin_role_id IS NOT NULL THEN
    INSERT INTO user_profiles (user_id, email, display_name, active)
    VALUES (hadi_id, 'abdulhadi@mimafood.nl', 'Abdulhadi', true)
    ON CONFLICT (user_id) DO UPDATE
      SET email = EXCLUDED.email,
          active = true,
          updated_at = NOW();

    INSERT INTO user_roles (user_id, role_id)
    VALUES (hadi_id, admin_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;

    INSERT INTO user_location_access (user_id, location_id)
    SELECT hadi_id, l.id
    FROM locations l
    ON CONFLICT (user_id, location_id) DO NOTHING;
  END IF;

  -- 2) Zuidas + source location selection for Van Gelder mapping sync
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
    WHERE lower(btrim(s.name)) = 'van gelder'
      AND s.location_id <> zuidas_location_id
    GROUP BY s.location_id
    ORDER BY mapping_count DESC
    LIMIT 1
  ) src;

  IF src_location_id IS NULL THEN
    RAISE NOTICE 'No non-Zuidas Van Gelder source mappings found; skipping Van Gelder seed.';
    RETURN;
  END IF;

  -- Ensure Van Gelder supplier exists on Zuidas (copy contact fields from source).
  INSERT INTO suppliers (name, location_id, contact_email, contact_info, minimum_order_value)
  SELECT
    ss.name,
    zuidas_location_id,
    ss.contact_email,
    ss.contact_info,
    ss.minimum_order_value
  FROM suppliers ss
  WHERE ss.location_id = src_location_id
    AND lower(btrim(ss.name)) = 'van gelder'
    AND NOT EXISTS (
      SELECT 1
      FROM suppliers sz
      WHERE sz.location_id = zuidas_location_id
        AND lower(btrim(sz.name)) = 'van gelder'
    );

  SELECT s.id
  INTO zuidas_vg_supplier_id
  FROM suppliers s
  WHERE s.location_id = zuidas_location_id
    AND lower(btrim(s.name)) = 'van gelder'
  LIMIT 1;

  IF zuidas_vg_supplier_id IS NULL THEN
    RAISE NOTICE 'Van Gelder supplier missing on Zuidas after seed; skipping mappings.';
    RETURN;
  END IF;

  -- Upsert Van Gelder supplier_ingredients by raw ingredient name.
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
    AND lower(btrim(s_src.name)) = 'van gelder'
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

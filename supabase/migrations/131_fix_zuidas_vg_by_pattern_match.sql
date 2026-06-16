-- 131: Robust Van Gelder sync for Zuidas using pattern match, not exact supplier name.
-- Root cause addressed: exact-name matching misses locations where supplier name differs
-- (e.g. "Van Gelder B.V.").

DO $$
DECLARE
  zuidas_id UUID;
  src_supplier_id UUID;
  src_location_id UUID;
  src_location_name TEXT;
  tgt_supplier_id UUID;
BEGIN
  -- Zuidas location
  SELECT id
  INTO zuidas_id
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

  -- Source Van Gelder supplier with most mappings, from non-Zuidas non-test location.
  SELECT s.id, s.location_id, l.name
  INTO src_supplier_id, src_location_id, src_location_name
  FROM suppliers s
  JOIN locations l ON l.id = s.location_id
  LEFT JOIN supplier_ingredients si ON si.supplier_id = s.id
  WHERE s.location_id <> zuidas_id
    AND lower(l.name) NOT LIKE '%test%'
    AND lower(s.name) LIKE '%van gelder%'
  GROUP BY s.id, s.location_id, l.name
  ORDER BY COUNT(si.id) DESC, l.name
  LIMIT 1;

  IF src_supplier_id IS NULL THEN
    RAISE EXCEPTION 'No Van Gelder source supplier found outside Zuidas.';
  END IF;

  -- Target Van Gelder supplier on Zuidas.
  SELECT id
  INTO tgt_supplier_id
  FROM suppliers
  WHERE location_id = zuidas_id
    AND lower(name) LIKE '%van gelder%'
  ORDER BY name
  LIMIT 1;

  IF tgt_supplier_id IS NULL THEN
    INSERT INTO suppliers (location_id, name)
    VALUES (zuidas_id, 'Van Gelder')
    RETURNING id INTO tgt_supplier_id;
  END IF;

  -- Normalize target supplier display name.
  UPDATE suppliers
  SET name = 'Van Gelder', updated_at = NOW()
  WHERE id = tgt_supplier_id;

  -- Copy supplier contact fields from source supplier.
  UPDATE suppliers t
  SET
    contact_email = s.contact_email,
    contact_info = s.contact_info,
    minimum_order_value = s.minimum_order_value,
    updated_at = NOW()
  FROM suppliers s
  WHERE t.id = tgt_supplier_id
    AND s.id = src_supplier_id;

  -- Copy order channel row from source supplier.
  INSERT INTO supplier_order_channels (
    supplier_id,
    channel,
    api_base_url,
    api_customer_code,
    email_to,
    email_cc,
    email_subject_template,
    whatsapp_phone,
    whatsapp_use_api,
    auto_send
  )
  SELECT
    tgt_supplier_id,
    c.channel,
    c.api_base_url,
    c.api_customer_code,
    c.email_to,
    c.email_cc,
    c.email_subject_template,
    c.whatsapp_phone,
    c.whatsapp_use_api,
    c.auto_send
  FROM supplier_order_channels c
  WHERE c.supplier_id = src_supplier_id
  ON CONFLICT (supplier_id) DO UPDATE
  SET
    channel = EXCLUDED.channel,
    api_base_url = EXCLUDED.api_base_url,
    api_customer_code = EXCLUDED.api_customer_code,
    email_to = EXCLUDED.email_to,
    email_cc = EXCLUDED.email_cc,
    email_subject_template = EXCLUDED.email_subject_template,
    whatsapp_phone = EXCLUDED.whatsapp_phone,
    whatsapp_use_api = EXCLUDED.whatsapp_use_api,
    auto_send = EXCLUDED.auto_send,
    updated_at = NOW();

  -- Replace Zuidas VG delivery schedule from source location's VG supplier schedule.
  DELETE FROM supplier_delivery_schedules
  WHERE location_id = zuidas_id
    AND supplier_id = tgt_supplier_id;

  INSERT INTO supplier_delivery_schedules (location_id, supplier_id, day_of_week)
  SELECT
    zuidas_id,
    tgt_supplier_id,
    sds.day_of_week
  FROM supplier_delivery_schedules sds
  WHERE sds.supplier_id = src_supplier_id
    AND sds.location_id = src_location_id;

  -- Ensure all source VG raws exist on Zuidas by raw name.
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
  WHERE sis.supplier_id = src_supplier_id
    AND rs.location_id = src_location_id
    AND NOT EXISTS (
      SELECT 1
      FROM raw_ingredients rz
      WHERE rz.location_id = zuidas_id
        AND lower(btrim(rz.name)) = lower(btrim(rs.name))
    );

  -- Upsert VG mappings source -> Zuidas by raw name.
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
    tgt_supplier_id,
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
  WHERE sis.supplier_id = src_supplier_id
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

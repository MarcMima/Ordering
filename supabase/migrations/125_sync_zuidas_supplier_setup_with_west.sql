-- Align Zuidas supplier setup with West for ordering behavior.
-- Keeps Zuidas-only extras (e.g. Turmeric rice) because we only upsert
-- rows that exist in West; we do not delete unmatched Zuidas mappings.

DO $$
DECLARE
  west_location_id UUID;
  zuidas_location_id UUID;
BEGIN
  SELECT id
  INTO west_location_id
  FROM locations
  WHERE lower(btrim(name)) IN (
      'mima west',
      'west',
      'mima amsterdam',
      'amsterdam',
      'mima amsterdam west'
    )
     OR lower(name) LIKE '% west%'
     OR lower(name) LIKE '%west %'
     OR lower(name) LIKE '%wester%'
  ORDER BY
    CASE
      WHEN lower(btrim(name)) IN ('mima west', 'west', 'mima amsterdam west') THEN 1
      WHEN lower(btrim(name)) IN ('mima amsterdam', 'amsterdam') THEN 2
      ELSE 3
    END,
    name
  LIMIT 1;

  SELECT id
  INTO zuidas_location_id
  FROM locations
  WHERE lower(btrim(name)) IN ('mima zuidas', 'zuidas', 'mima zuid')
     OR lower(name) LIKE '%zuidas%'
     OR lower(name) LIKE '% zuid%'
  ORDER BY
    CASE
      WHEN lower(btrim(name)) IN ('mima zuidas', 'zuidas') THEN 1
      ELSE 2
    END,
    name
  LIMIT 1;

  IF west_location_id IS NULL THEN
    RAISE EXCEPTION 'Could not find West location (name LIKE %%west%%).';
  END IF;
  IF zuidas_location_id IS NULL THEN
    RAISE EXCEPTION 'Could not find Zuidas location (name LIKE %%zuidas%%).';
  END IF;

  -- 1) Ensure Zuidas has all suppliers that exist in West.
  INSERT INTO suppliers (name, location_id, contact_email, contact_info, minimum_order_value)
  SELECT
    sw.name,
    zuidas_location_id,
    sw.contact_email,
    sw.contact_info,
    sw.minimum_order_value
  FROM suppliers sw
  WHERE sw.location_id = west_location_id
    AND NOT EXISTS (
      SELECT 1
      FROM suppliers sz
      WHERE sz.location_id = zuidas_location_id
        AND lower(btrim(sz.name)) = lower(btrim(sw.name))
    );

  -- 2) Sync supplier contact fields West -> Zuidas by supplier name.
  UPDATE suppliers sz
  SET
    contact_email = sw.contact_email,
    contact_info = sw.contact_info,
    minimum_order_value = sw.minimum_order_value,
    updated_at = NOW()
  FROM suppliers sw
  WHERE sw.location_id = west_location_id
    AND sz.location_id = zuidas_location_id
    AND lower(btrim(sz.name)) = lower(btrim(sw.name));

  -- 3) Sync order-channel config West -> Zuidas by supplier name.
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
    sz.id AS supplier_id,
    socw.channel,
    socw.api_base_url,
    socw.api_customer_code,
    socw.email_to,
    socw.email_cc,
    socw.email_subject_template,
    socw.whatsapp_phone,
    socw.whatsapp_use_api,
    socw.auto_send
  FROM suppliers sw
  JOIN suppliers sz
    ON sz.location_id = zuidas_location_id
   AND lower(btrim(sz.name)) = lower(btrim(sw.name))
  JOIN supplier_order_channels socw
    ON socw.supplier_id = sw.id
  WHERE sw.location_id = west_location_id
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

  -- 4) Replace Zuidas delivery schedules with West schedules (for matching supplier names).
  DELETE FROM supplier_delivery_schedules sdz
  USING suppliers sz, suppliers sw
  WHERE sdz.location_id = zuidas_location_id
    AND sdz.supplier_id = sz.id
    AND sw.location_id = west_location_id
    AND sz.location_id = zuidas_location_id
    AND lower(btrim(sz.name)) = lower(btrim(sw.name));

  INSERT INTO supplier_delivery_schedules (location_id, supplier_id, day_of_week)
  SELECT
    zuidas_location_id,
    sz.id,
    sdw.day_of_week
  FROM supplier_delivery_schedules sdw
  JOIN suppliers sw ON sw.id = sdw.supplier_id
  JOIN suppliers sz
    ON sz.location_id = zuidas_location_id
   AND lower(btrim(sz.name)) = lower(btrim(sw.name))
  WHERE sdw.location_id = west_location_id
    AND sw.location_id = west_location_id
    AND NOT EXISTS (
      SELECT 1
      FROM supplier_delivery_schedules existing
      WHERE existing.location_id = zuidas_location_id
        AND existing.supplier_id = sz.id
        AND existing.day_of_week = sdw.day_of_week
    );

  -- 5) Sync supplier_ingredients mappings West -> Zuidas
  --    by supplier name + raw ingredient name.
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
    sz.id AS supplier_id,
    rz.id AS raw_ingredient_id,
    siw.supplier_sku,
    siw.is_preferred,
    siw.ean_code,
    siw.supplier_article_code,
    siw.supplier_article_name,
    siw.order_unit,
    siw.order_unit_size,
    siw.notes
  FROM supplier_ingredients siw
  JOIN suppliers sw ON sw.id = siw.supplier_id
  JOIN raw_ingredients rw ON rw.id = siw.raw_ingredient_id
  JOIN suppliers sz
    ON sz.location_id = zuidas_location_id
   AND lower(btrim(sz.name)) = lower(btrim(sw.name))
  JOIN raw_ingredients rz
    ON rz.location_id = zuidas_location_id
   AND lower(btrim(rz.name)) = lower(btrim(rw.name))
  WHERE sw.location_id = west_location_id
    AND rw.location_id = west_location_id
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

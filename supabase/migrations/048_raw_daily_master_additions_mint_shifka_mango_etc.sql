-- Adds / updates master raw ingredients that were added to generate_028_master_sync.py after some DBs
-- already applied an older 028. Idempotent with current 028_sync_master_catalog_from_sheet.sql.
-- Mint: bag 1 kg (was smaller bag in older sheet). New: Shifka peppers, Mango, Cacao powder,
-- Coriander (fresh), Cauliflower, Yoghurt, Rice pandan.

DO $$
DECLARE
  loc_id UUID;
  rid UUID;
  sup_id UUID;
BEGIN
  FOR loc_id IN SELECT id FROM locations
  LOOP

    -- Mint
    SELECT id INTO rid FROM raw_ingredients WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Mint')) LIMIT 1;
    IF rid IS NULL THEN
      INSERT INTO raw_ingredients (location_id, name, unit, order_interval_days, stocktake_visible, stocktake_day_of_week, stocktake_unit_label, stocktake_content_amount, stocktake_content_unit)
      VALUES (loc_id, 'Mint', 'g', NULL, TRUE, NULL, 'bag', 1.0, 'kg')
      RETURNING id INTO rid;
    ELSE
      UPDATE raw_ingredients SET unit = 'g', order_interval_days = NULL, stocktake_visible = TRUE, stocktake_day_of_week = NULL, stocktake_unit_label = 'bag', stocktake_content_amount = 1.0, stocktake_content_unit = 'kg', updated_at = NOW() WHERE id = rid;
    END IF;

    DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;

    INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
    VALUES (rid, 1.0, 'kg', 'both', 'bag');

    DELETE FROM supplier_ingredients WHERE raw_ingredient_id = rid;

    INSERT INTO suppliers (location_id, name)
    SELECT loc_id, 'Van Gelder' WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.location_id = loc_id AND lower(btrim(s.name)) = lower(btrim('Van Gelder')));

    SELECT id INTO sup_id FROM suppliers WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Van Gelder')) LIMIT 1;
    INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
    VALUES (sup_id, rid, true)
    ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE SET is_preferred = EXCLUDED.is_preferred, updated_at = NOW();

    -- Shifka peppers
    SELECT id INTO rid FROM raw_ingredients WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Shifka peppers')) LIMIT 1;
    IF rid IS NULL THEN
      INSERT INTO raw_ingredients (location_id, name, unit, order_interval_days, stocktake_visible, stocktake_day_of_week, stocktake_unit_label, stocktake_content_amount, stocktake_content_unit)
      VALUES (loc_id, 'Shifka peppers', 'g', NULL, TRUE, NULL, 'can', 3.0, 'kg')
      RETURNING id INTO rid;
    ELSE
      UPDATE raw_ingredients SET unit = 'g', order_interval_days = NULL, stocktake_visible = TRUE, stocktake_day_of_week = NULL, stocktake_unit_label = 'can', stocktake_content_amount = 3.0, stocktake_content_unit = 'kg', updated_at = NOW() WHERE id = rid;
    END IF;

    DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;

    INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
    VALUES (rid, 3.0, 'kg', 'both', 'can');

    DELETE FROM supplier_ingredients WHERE raw_ingredient_id = rid;

    INSERT INTO suppliers (location_id, name)
    SELECT loc_id, 'Bidfood' WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.location_id = loc_id AND lower(btrim(s.name)) = lower(btrim('Bidfood')));

    SELECT id INTO sup_id FROM suppliers WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Bidfood')) LIMIT 1;
    INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
    VALUES (sup_id, rid, true)
    ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE SET is_preferred = EXCLUDED.is_preferred, updated_at = NOW();

    -- Mango
    SELECT id INTO rid FROM raw_ingredients WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Mango')) LIMIT 1;
    IF rid IS NULL THEN
      INSERT INTO raw_ingredients (location_id, name, unit, order_interval_days, stocktake_visible, stocktake_day_of_week, stocktake_unit_label, stocktake_content_amount, stocktake_content_unit)
      VALUES (loc_id, 'Mango', 'g', NULL, TRUE, NULL, 'bag', 1.0, 'kg')
      RETURNING id INTO rid;
    ELSE
      UPDATE raw_ingredients SET unit = 'g', order_interval_days = NULL, stocktake_visible = TRUE, stocktake_day_of_week = NULL, stocktake_unit_label = 'bag', stocktake_content_amount = 1.0, stocktake_content_unit = 'kg', updated_at = NOW() WHERE id = rid;
    END IF;

    DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;

    INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
    VALUES (rid, 1.0, 'kg', 'both', 'bag');

    DELETE FROM supplier_ingredients WHERE raw_ingredient_id = rid;

    INSERT INTO suppliers (location_id, name)
    SELECT loc_id, 'Bidfood' WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.location_id = loc_id AND lower(btrim(s.name)) = lower(btrim('Bidfood')));

    SELECT id INTO sup_id FROM suppliers WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Bidfood')) LIMIT 1;
    INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
    VALUES (sup_id, rid, true)
    ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE SET is_preferred = EXCLUDED.is_preferred, updated_at = NOW();

    -- Cacao powder
    SELECT id INTO rid FROM raw_ingredients WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Cacao powder')) LIMIT 1;
    IF rid IS NULL THEN
      INSERT INTO raw_ingredients (location_id, name, unit, order_interval_days, stocktake_visible, stocktake_day_of_week, stocktake_unit_label, stocktake_content_amount, stocktake_content_unit)
      VALUES (loc_id, 'Cacao powder', 'g', NULL, TRUE, NULL, 'box', 3.5, 'kg')
      RETURNING id INTO rid;
    ELSE
      UPDATE raw_ingredients SET unit = 'g', order_interval_days = NULL, stocktake_visible = TRUE, stocktake_day_of_week = NULL, stocktake_unit_label = 'box', stocktake_content_amount = 3.5, stocktake_content_unit = 'kg', updated_at = NOW() WHERE id = rid;
    END IF;

    DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;

    INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
    VALUES (rid, 3.5, 'kg', 'both', 'box');

    DELETE FROM supplier_ingredients WHERE raw_ingredient_id = rid;

    INSERT INTO suppliers (location_id, name)
    SELECT loc_id, 'Van Gelder' WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.location_id = loc_id AND lower(btrim(s.name)) = lower(btrim('Van Gelder')));

    SELECT id INTO sup_id FROM suppliers WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Van Gelder')) LIMIT 1;
    INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
    VALUES (sup_id, rid, true)
    ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE SET is_preferred = EXCLUDED.is_preferred, updated_at = NOW();

    -- Coriander (fresh)
    SELECT id INTO rid FROM raw_ingredients WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Coriander (fresh)')) LIMIT 1;
    IF rid IS NULL THEN
      INSERT INTO raw_ingredients (location_id, name, unit, order_interval_days, stocktake_visible, stocktake_day_of_week, stocktake_unit_label, stocktake_content_amount, stocktake_content_unit)
      VALUES (loc_id, 'Coriander (fresh)', 'g', NULL, TRUE, NULL, 'bag', 1.0, 'kg')
      RETURNING id INTO rid;
    ELSE
      UPDATE raw_ingredients SET unit = 'g', order_interval_days = NULL, stocktake_visible = TRUE, stocktake_day_of_week = NULL, stocktake_unit_label = 'bag', stocktake_content_amount = 1.0, stocktake_content_unit = 'kg', updated_at = NOW() WHERE id = rid;
    END IF;

    DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;

    INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
    VALUES (rid, 1.0, 'kg', 'both', 'bag');

    DELETE FROM supplier_ingredients WHERE raw_ingredient_id = rid;

    INSERT INTO suppliers (location_id, name)
    SELECT loc_id, 'Van Gelder' WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.location_id = loc_id AND lower(btrim(s.name)) = lower(btrim('Van Gelder')));

    SELECT id INTO sup_id FROM suppliers WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Van Gelder')) LIMIT 1;
    INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
    VALUES (sup_id, rid, true)
    ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE SET is_preferred = EXCLUDED.is_preferred, updated_at = NOW();

    -- Cauliflower
    SELECT id INTO rid FROM raw_ingredients WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Cauliflower')) LIMIT 1;
    IF rid IS NULL THEN
      INSERT INTO raw_ingredients (location_id, name, unit, order_interval_days, stocktake_visible, stocktake_day_of_week, stocktake_unit_label, stocktake_content_amount, stocktake_content_unit)
      VALUES (loc_id, 'Cauliflower', 'g', NULL, TRUE, NULL, 'bag', 2.5, 'kg')
      RETURNING id INTO rid;
    ELSE
      UPDATE raw_ingredients SET unit = 'g', order_interval_days = NULL, stocktake_visible = TRUE, stocktake_day_of_week = NULL, stocktake_unit_label = 'bag', stocktake_content_amount = 2.5, stocktake_content_unit = 'kg', updated_at = NOW() WHERE id = rid;
    END IF;

    DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;

    INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
    VALUES (rid, 2.5, 'kg', 'both', 'bag');

    DELETE FROM supplier_ingredients WHERE raw_ingredient_id = rid;

    INSERT INTO suppliers (location_id, name)
    SELECT loc_id, 'Bidfood' WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.location_id = loc_id AND lower(btrim(s.name)) = lower(btrim('Bidfood')));

    SELECT id INTO sup_id FROM suppliers WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Bidfood')) LIMIT 1;
    INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
    VALUES (sup_id, rid, true)
    ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE SET is_preferred = EXCLUDED.is_preferred, updated_at = NOW();

    -- Yoghurt
    SELECT id INTO rid FROM raw_ingredients WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Yoghurt')) LIMIT 1;
    IF rid IS NULL THEN
      INSERT INTO raw_ingredients (location_id, name, unit, order_interval_days, stocktake_visible, stocktake_day_of_week, stocktake_unit_label, stocktake_content_amount, stocktake_content_unit)
      VALUES (loc_id, 'Yoghurt', 'g', NULL, TRUE, NULL, 'tub', 1.0, 'kg')
      RETURNING id INTO rid;
    ELSE
      UPDATE raw_ingredients SET unit = 'g', order_interval_days = NULL, stocktake_visible = TRUE, stocktake_day_of_week = NULL, stocktake_unit_label = 'tub', stocktake_content_amount = 1.0, stocktake_content_unit = 'kg', updated_at = NOW() WHERE id = rid;
    END IF;

    DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;

    INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
    VALUES (rid, 1.0, 'kg', 'both', 'tub');

    DELETE FROM supplier_ingredients WHERE raw_ingredient_id = rid;

    INSERT INTO suppliers (location_id, name)
    SELECT loc_id, 'Bidfood' WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.location_id = loc_id AND lower(btrim(s.name)) = lower(btrim('Bidfood')));

    SELECT id INTO sup_id FROM suppliers WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Bidfood')) LIMIT 1;
    INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
    VALUES (sup_id, rid, true)
    ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE SET is_preferred = EXCLUDED.is_preferred, updated_at = NOW();

    -- Rice pandan
    SELECT id INTO rid FROM raw_ingredients WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Rice pandan')) LIMIT 1;
    IF rid IS NULL THEN
      INSERT INTO raw_ingredients (location_id, name, unit, order_interval_days, stocktake_visible, stocktake_day_of_week, stocktake_unit_label, stocktake_content_amount, stocktake_content_unit)
      VALUES (loc_id, 'Rice pandan', 'g', NULL, TRUE, NULL, 'bag', 4.5, 'kg')
      RETURNING id INTO rid;
    ELSE
      UPDATE raw_ingredients SET unit = 'g', order_interval_days = NULL, stocktake_visible = TRUE, stocktake_day_of_week = NULL, stocktake_unit_label = 'bag', stocktake_content_amount = 4.5, stocktake_content_unit = 'kg', updated_at = NOW() WHERE id = rid;
    END IF;

    DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;

    INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
    VALUES (rid, 4.5, 'kg', 'both', 'bag');

    DELETE FROM supplier_ingredients WHERE raw_ingredient_id = rid;

    INSERT INTO suppliers (location_id, name)
    SELECT loc_id, 'Bidfood' WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.location_id = loc_id AND lower(btrim(s.name)) = lower(btrim('Bidfood')));

    SELECT id INTO sup_id FROM suppliers WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Bidfood')) LIMIT 1;
    INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
    VALUES (sup_id, rid, true)
    ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE SET is_preferred = EXCLUDED.is_preferred, updated_at = NOW();

  END LOOP;
END $$;

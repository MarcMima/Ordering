-- Adds / updates master raw ingredients from generate_028_master_sync.py TSV (Rose petals, Dried dill,
-- Xantana). Rose petals + Dried dill → Tuana; Xantana → Bidfood. Idempotent with 028 for DBs that already
-- applied an older 028.

DO $$
DECLARE
  loc_id UUID;
  rid UUID;
  sup_id UUID;
BEGIN
  FOR loc_id IN SELECT id FROM locations
  LOOP

    -- Rose petals
    SELECT id INTO rid FROM raw_ingredients WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Rose petals')) LIMIT 1;
    IF rid IS NULL THEN
      INSERT INTO raw_ingredients (location_id, name, unit, order_interval_days, stocktake_visible, stocktake_day_of_week, stocktake_unit_label, stocktake_content_amount, stocktake_content_unit)
      VALUES (loc_id, 'Rose petals', 'g', NULL, TRUE, NULL, 'bag', 0.5, 'kg')
      RETURNING id INTO rid;
    ELSE
      UPDATE raw_ingredients SET unit = 'g', order_interval_days = NULL, stocktake_visible = TRUE, stocktake_day_of_week = NULL, stocktake_unit_label = 'bag', stocktake_content_amount = 0.5, stocktake_content_unit = 'kg', updated_at = NOW() WHERE id = rid;
    END IF;

    DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;

    INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
    VALUES (rid, 0.5, 'kg', 'both', 'bag');

    DELETE FROM supplier_ingredients WHERE raw_ingredient_id = rid;

    INSERT INTO suppliers (location_id, name)
    SELECT loc_id, 'Tuana' WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.location_id = loc_id AND lower(btrim(s.name)) = lower(btrim('Tuana')));

    SELECT id INTO sup_id FROM suppliers WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Tuana')) LIMIT 1;
    INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
    VALUES (sup_id, rid, true)
    ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE SET is_preferred = EXCLUDED.is_preferred, updated_at = NOW();

    -- Dried dill
    SELECT id INTO rid FROM raw_ingredients WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Dried dill')) LIMIT 1;
    IF rid IS NULL THEN
      INSERT INTO raw_ingredients (location_id, name, unit, order_interval_days, stocktake_visible, stocktake_day_of_week, stocktake_unit_label, stocktake_content_amount, stocktake_content_unit)
      VALUES (loc_id, 'Dried dill', 'g', NULL, TRUE, NULL, 'pack', 0.5, 'kg')
      RETURNING id INTO rid;
    ELSE
      UPDATE raw_ingredients SET unit = 'g', order_interval_days = NULL, stocktake_visible = TRUE, stocktake_day_of_week = NULL, stocktake_unit_label = 'pack', stocktake_content_amount = 0.5, stocktake_content_unit = 'kg', updated_at = NOW() WHERE id = rid;
    END IF;

    DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;

    INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
    VALUES (rid, 0.5, 'kg', 'both', 'pack');

    DELETE FROM supplier_ingredients WHERE raw_ingredient_id = rid;

    INSERT INTO suppliers (location_id, name)
    SELECT loc_id, 'Tuana' WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.location_id = loc_id AND lower(btrim(s.name)) = lower(btrim('Tuana')));

    SELECT id INTO sup_id FROM suppliers WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Tuana')) LIMIT 1;
    INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
    VALUES (sup_id, rid, true)
    ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE SET is_preferred = EXCLUDED.is_preferred, updated_at = NOW();

    -- Xantana
    SELECT id INTO rid FROM raw_ingredients WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Xantana')) LIMIT 1;
    IF rid IS NULL THEN
      INSERT INTO raw_ingredients (location_id, name, unit, order_interval_days, stocktake_visible, stocktake_day_of_week, stocktake_unit_label, stocktake_content_amount, stocktake_content_unit)
      VALUES (loc_id, 'Xantana', 'g', NULL, TRUE, NULL, 'pack', 0.5, 'kg')
      RETURNING id INTO rid;
    ELSE
      UPDATE raw_ingredients SET unit = 'g', order_interval_days = NULL, stocktake_visible = TRUE, stocktake_day_of_week = NULL, stocktake_unit_label = 'pack', stocktake_content_amount = 0.5, stocktake_content_unit = 'kg', updated_at = NOW() WHERE id = rid;
    END IF;

    DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;

    INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
    VALUES (rid, 0.5, 'kg', 'both', 'pack');

    DELETE FROM supplier_ingredients WHERE raw_ingredient_id = rid;

    INSERT INTO suppliers (location_id, name)
    SELECT loc_id, 'Bidfood' WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.location_id = loc_id AND lower(btrim(s.name)) = lower(btrim('Bidfood')));

    SELECT id INTO sup_id FROM suppliers WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Bidfood')) LIMIT 1;
    INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
    VALUES (sup_id, rid, true)
    ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE SET is_preferred = EXCLUDED.is_preferred, updated_at = NOW();

  END LOOP;
END $$;

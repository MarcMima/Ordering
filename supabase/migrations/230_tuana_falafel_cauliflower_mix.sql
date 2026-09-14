-- Tuana: add "Falafel mix" and "Cauliflower mix" (1 kg bags) to the weekly ordering
-- on all locations. Same setup as the other Tuana spices (migrations 141/164):
-- preferred supplier Tuana, 1 kg pack, weekly stocktake on Monday, 7-day order interval.
-- No price yet (Tuana prices are managed manually).

DO $$
DECLARE
  loc_id uuid;
  sup_id uuid;
  rid uuid;
  v record;
BEGIN
  FOR loc_id IN SELECT id FROM locations LOOP
    SELECT id INTO sup_id
    FROM suppliers
    WHERE location_id = loc_id AND lower(btrim(name)) = 'tuana'
    LIMIT 1;
    IF sup_id IS NULL THEN
      RAISE NOTICE 'No Tuana supplier for location %, skipped', loc_id;
      CONTINUE;
    END IF;

    FOR v IN
      SELECT * FROM (VALUES
        ('Falafel mix',     612),
        ('Cauliflower mix', 614)
      ) AS t(name, display_order)
    LOOP
      SELECT id INTO rid
      FROM raw_ingredients
      WHERE location_id = loc_id AND lower(btrim(name)) = lower(v.name)
      LIMIT 1;

      IF rid IS NULL THEN
        INSERT INTO raw_ingredients (location_id, name, unit, item_kind)
        VALUES (loc_id, v.name, 'g', 'food')
        RETURNING id INTO rid;
      END IF;

      INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
      VALUES (sup_id, rid, true)
      ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
        SET is_preferred = EXCLUDED.is_preferred, updated_at = NOW();

      DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;
      INSERT INTO ingredient_pack_sizes
        (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple)
      VALUES (rid, 1.0, 'kg', 'both', 'bag', 1);

      UPDATE raw_ingredients
      SET
        stocktake_visible = TRUE,
        stocktake_unit_label = 'bag',
        stocktake_content_amount = 1.0,
        stocktake_content_unit = 'kg',
        stocktake_day_of_week = 1,
        order_interval_days = 7,
        stocktake_display_order = v.display_order,
        updated_at = NOW()
      WHERE id = rid;
    END LOOP;
  END LOOP;
END $$;

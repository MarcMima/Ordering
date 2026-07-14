-- Coriander (ground): Tuana supplier (VG removed in 133, never replaced).
-- Re-link Falafel/Srug coriander after rename Coriander → Coriander (ground).

DO $$
DECLARE
  loc_id uuid;
  rid uuid;
  sup_id uuid;
BEGIN
  FOR loc_id IN SELECT id FROM locations LOOP
    SELECT id INTO rid
    FROM raw_ingredients
    WHERE location_id = loc_id
      AND lower(btrim(name)) = lower(btrim('Coriander (ground)'))
    LIMIT 1;
    IF rid IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO suppliers (location_id, name)
    SELECT loc_id, 'Tuana'
    WHERE NOT EXISTS (
      SELECT 1 FROM suppliers s
      WHERE s.location_id = loc_id AND lower(btrim(s.name)) = lower(btrim('Tuana'))
    );

    SELECT id INTO sup_id
    FROM suppliers
    WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Tuana'))
    LIMIT 1;

    DELETE FROM supplier_ingredients WHERE raw_ingredient_id = rid;

    INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
    VALUES (sup_id, rid, true)
    ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
      SET is_preferred = EXCLUDED.is_preferred, updated_at = NOW();

    DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;

    INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
    VALUES (rid, 1.0, 'kg', 'both', 'pack');

    UPDATE raw_ingredients
    SET
      stocktake_visible = TRUE,
      stocktake_unit_label = 'pack',
      stocktake_content_amount = 1.0,
      stocktake_content_unit = 'kg',
      stocktake_day_of_week = 1,
      order_interval_days = 7,
      updated_at = NOW()
    WHERE id = rid;
  END LOOP;
END $$;

INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
SELECT p.id, r.id, v.qty
FROM (
  VALUES
    ('Falafel', 'Coriander (ground)', 370::numeric),
    ('Srug', 'Coriander (ground)', 320::numeric)
) AS v(prep_name, raw_name, qty)
JOIN prep_items p ON lower(btrim(p.name)) = lower(btrim(v.prep_name))
JOIN location_prep_items lpi ON lpi.prep_item_id = p.id
JOIN raw_ingredients r
  ON r.location_id = lpi.location_id
 AND lower(btrim(r.name)) = lower(btrim(v.raw_name))
ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
  SET quantity_per_unit = EXCLUDED.quantity_per_unit, updated_at = NOW();

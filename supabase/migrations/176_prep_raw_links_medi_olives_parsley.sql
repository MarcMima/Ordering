-- Prep → raw links: Mediterranean pickles, Olives, Parsley (raw stock credits prep need).

DO $$
DECLARE
  loc_id UUID;
  pi_id UUID;
  ri_id UUID;
BEGIN
  -- Mediterranean pickles GN 1/6 (~1000 g) ← Middle Eastern pickles can (3 kg)
  SELECT id INTO pi_id FROM prep_items
  WHERE lower(btrim(name)) = lower(btrim('Mediterranean pickles')) LIMIT 1;
  FOR loc_id IN SELECT id FROM locations LOOP
    SELECT id INTO ri_id FROM raw_ingredients
    WHERE location_id = loc_id
      AND lower(btrim(name)) = lower(btrim('Middle Eastern pickles'))
    LIMIT 1;
    IF pi_id IS NOT NULL AND ri_id IS NOT NULL THEN
      INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
      VALUES (pi_id, ri_id, 1000)
      ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
      SET quantity_per_unit = EXCLUDED.quantity_per_unit, updated_at = NOW();
    END IF;
  END LOOP;

  -- Olives GN 1/6 (~750 g) ← Kalamata olives jar
  SELECT id INTO pi_id FROM prep_items
  WHERE lower(btrim(name)) = lower(btrim('Olives')) LIMIT 1;
  FOR loc_id IN SELECT id FROM locations LOOP
    SELECT id INTO ri_id FROM raw_ingredients
    WHERE location_id = loc_id
      AND lower(btrim(name)) = lower(btrim('Kalamata olives'))
    LIMIT 1;
    IF pi_id IS NOT NULL AND ri_id IS NOT NULL THEN
      INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
      VALUES (pi_id, ri_id, 750)
      ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
      SET quantity_per_unit = EXCLUDED.quantity_per_unit, updated_at = NOW();
    END IF;
  END LOOP;

  -- Parsley GN 1/6 (500 g) ← Parsley raw
  SELECT id INTO pi_id FROM prep_items
  WHERE lower(btrim(name)) = lower(btrim('Parsley')) LIMIT 1;
  FOR loc_id IN SELECT id FROM locations LOOP
    SELECT id INTO ri_id FROM raw_ingredients
    WHERE location_id = loc_id
      AND lower(btrim(name)) = lower(btrim('Parsley'))
    LIMIT 1;
    IF pi_id IS NOT NULL AND ri_id IS NOT NULL THEN
      INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
      VALUES (pi_id, ri_id, 500)
      ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
      SET quantity_per_unit = EXCLUDED.quantity_per_unit, updated_at = NOW();
    END IF;
  END LOOP;
END $$;

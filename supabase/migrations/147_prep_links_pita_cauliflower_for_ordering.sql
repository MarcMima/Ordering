-- Prep → raw links so Bidfood ordering picks up pita and cauliflower from prep planning.

DO $$
DECLARE
  loc_id UUID;
  pi_id UUID;
  ri_id UUID;
BEGIN
  FOR loc_id IN SELECT id FROM locations
  LOOP
    -- Regular pita (base 2 boxes/day): 1 prep box = 50 pcs raw pita
    SELECT id INTO pi_id FROM prep_items
    WHERE lower(btrim(name)) = lower(btrim('Regular pita with za''atar')) LIMIT 1;
    SELECT id INTO ri_id FROM raw_ingredients
    WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Pita bread 15 cm')) LIMIT 1;
    IF pi_id IS NOT NULL AND ri_id IS NOT NULL THEN
      INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
      VALUES (pi_id, ri_id, 50)
      ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
      SET quantity_per_unit = EXCLUDED.quantity_per_unit;
    END IF;

    -- Coated cauliflower GN 1/2 (~3 kg output): ~2.5 kg raw cauliflower per prep unit
    SELECT id INTO pi_id FROM prep_items
    WHERE lower(btrim(name)) = lower(btrim('Coated Cauliflower')) LIMIT 1;
    SELECT id INTO ri_id FROM raw_ingredients
    WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Cauliflower')) LIMIT 1;
    IF pi_id IS NOT NULL AND ri_id IS NOT NULL THEN
      INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
      VALUES (pi_id, ri_id, 2500)
      ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
      SET quantity_per_unit = EXCLUDED.quantity_per_unit;
    END IF;
  END LOOP;
END $$;

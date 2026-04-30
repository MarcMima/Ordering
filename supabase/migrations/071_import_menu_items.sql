-- 071: Menukaart import — Flatbreads en Pita's
-- Data uit Gerechten sheet (Excel 260309_Voedingswaarde_Mima.xlsx)
-- Grammen per component per gerecht, exact zoals in het Excel-bestand.
-- Run na 069 (tabellen) en 070 (voedingswaarden grondstoffen).
--
-- Structuur:
--   menu_items.category = 'flatbread' | 'pita' | 'bowl' | 'mezze'
--   menu_items.subcategory = 'chicken' | 'falafel' | 'sabich' | 'cauliflower'
--   menu_item_components verwijst naar prep_items (Hummus, Falafel, etc.)
--   of raw_ingredients (Flatbread, Pita, Ei) voor rechtstreekse grondstoffen.
--
-- Bowls worden in 072 ingevoerd (modular base + protein structuur).

DO $$
DECLARE
  mi_id UUID;
  prep_id UUID;
  raw_id UUID;
BEGIN

  -- ─── FLATBREAD CHICKEN ──────────────────────────────────────────────────
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Flatbread Chicken', 'flatbread', 'chicken', true, 10)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING
  RETURNING id INTO mi_id;

  IF mi_id IS NULL THEN
    SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'flatbread chicken' LIMIT 1;
  END IF;

  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;

  -- Flatbread (raw ingredient)
  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Flatbread')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 70, '1 flatbread', 10);
  END IF;

  -- Hummus
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Hummus')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 50, '1 spoon', 20);
  END IF;

  -- Mediterranean salad
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Mediterranean salad / Medi salad')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 100, '1 spoon', 30);
  END IF;

  -- Pickled onion
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Pickled onion')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 40, '1 pinch', 40);
  END IF;

  -- Tzatziki
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Tzatziki')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 40, '1 ladle', 50);
  END IF;

  -- Marinated chicken (grilled)
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Marinated chicken')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 120, '1 scoop', 60);
  END IF;

  -- ─── FLATBREAD FALAFEL ──────────────────────────────────────────────────
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Flatbread Falafel', 'flatbread', 'falafel', true, 20)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING
  RETURNING id INTO mi_id;

  IF mi_id IS NULL THEN
    SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'flatbread falafel' LIMIT 1;
  END IF;

  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;

  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Flatbread')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 70, '1 flatbread', 10);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Hummus')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 50, '1 spoon', 20);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Mediterranean salad / Medi salad')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 100, '1 spoon', 30);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Pickled cabbage')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 60, '1 pinch', 40);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Falafel')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 120, '4 pcs', 50);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Tarator')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 25, '1 drizzle', 60);
  END IF;

  -- ─── FLATBREAD SABICH ──────────────────────────────────────────────────
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Flatbread Sabich', 'flatbread', 'sabich', true, 30)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING
  RETURNING id INTO mi_id;

  IF mi_id IS NULL THEN
    SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'flatbread sabich' LIMIT 1;
  END IF;

  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;

  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Flatbread')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 70, '1 flatbread', 10);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Hummus')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 50, '1 spoon', 20);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Mediterranean salad / Medi salad')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 100, '1 spoon', 30);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Pickled cabbage')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 60, '1 pinch', 40);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Tarator')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 25, '1 drizzle', 50);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Amba')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 25, '1 drizzle', 60);
  END IF;

  -- Ei (raw ingredient)
  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Eggs')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 60, '1 egg', 70);
  END IF;

  -- Aubergine / Sabich (prep item)
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Aubergine / Sabich')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 70, '1 scoop', 80);
  END IF;

  -- ─── FLATBREAD CAULIFLOWER ────────────────────────────────────────────────
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Flatbread Cauliflower', 'flatbread', 'cauliflower', true, 40)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING
  RETURNING id INTO mi_id;

  IF mi_id IS NULL THEN
    SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'flatbread cauliflower' LIMIT 1;
  END IF;

  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;

  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Flatbread')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 70, '1 flatbread', 10);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Hummus')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 50, '1 spoon', 20);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Mediterranean salad / Medi salad')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 100, '1 spoon', 30);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Pickled cabbage')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 60, '1 pinch', 40);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Coated Cauliflower')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 100, '1 scoop', 50);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Pomegranate')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 15, '1 spoon', 60);
  ELSE
    SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Pomegranate seeds')) LIMIT 1;
    IF raw_id IS NOT NULL THEN
      INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
      VALUES (mi_id, raw_id, 15, '1 spoon', 60);
    END IF;
  END IF;

  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Parsley')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 1, 'sprinkle', 70);
  END IF;

  -- ─── PITA CHICKEN ──────────────────────────────────────────────────────
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Pita Chicken', 'pita', 'chicken', true, 50)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING
  RETURNING id INTO mi_id;

  IF mi_id IS NULL THEN
    SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'pita chicken' LIMIT 1;
  END IF;

  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;

  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Pita bread 15 cm')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 100, '1 pita', 10);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Hummus')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 50, '1 spoon', 20);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Mediterranean salad / Medi salad')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 100, '1 spoon', 30);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Pickled onion')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 40, '1 pinch', 40);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Tzatziki')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 40, '1 ladle', 50);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Marinated chicken')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 120, '1 scoop', 60);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Tarator')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 25, '1 drizzle', 70);
  END IF;

  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Parsley')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 1, '1 pinch', 80);
  END IF;

  -- ─── PITA FALAFEL ──────────────────────────────────────────────────────
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Pita Falafel', 'pita', 'falafel', true, 60)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING
  RETURNING id INTO mi_id;

  IF mi_id IS NULL THEN
    SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'pita falafel' LIMIT 1;
  END IF;

  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;

  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Pita bread 15 cm')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 100, '1 pita', 10);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Hummus')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 50, '1 spoon', 20);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Mediterranean salad / Medi salad')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 100, '1 spoon', 30);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Pickled cabbage')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 60, '1 pinch', 40);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Falafel')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 120, '4 pcs', 50);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Tarator')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 25, '1 drizzle', 60);
  END IF;

  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Parsley')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 1, '1 pinch', 70);
  END IF;

  -- ─── PITA SABICH ──────────────────────────────────────────────────────
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Pita Sabich', 'pita', 'sabich', true, 70)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING
  RETURNING id INTO mi_id;

  IF mi_id IS NULL THEN
    SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'pita sabich' LIMIT 1;
  END IF;

  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;

  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Pita bread 15 cm')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 100, '1 pita', 10);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Hummus')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 50, '1 spoon', 20);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Mediterranean salad / Medi salad')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 100, '1 spoon', 30);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Pickled cabbage')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 60, '1 pinch', 40);
  END IF;

  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Eggs')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 60, '1 egg', 50);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Aubergine / Sabich')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 70, '1 scoop', 60);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Tarator')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 25, '1 drizzle', 70);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Amba')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 25, '1 drizzle', 80);
  END IF;

  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Parsley')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 1, '1 pinch', 90);
  END IF;

  -- ─── PITA CAULIFLOWER ──────────────────────────────────────────────────
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Pita Cauliflower', 'pita', 'cauliflower', true, 80)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING
  RETURNING id INTO mi_id;

  IF mi_id IS NULL THEN
    SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'pita cauliflower' LIMIT 1;
  END IF;

  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;

  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Pita bread 15 cm')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 100, '1 pita', 10);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Hummus')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 50, '1 spoon', 20);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Mediterranean salad / Medi salad')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 100, '1 spoon', 30);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Pickled cabbage')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 60, '1 pinch', 40);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Coated Cauliflower')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 100, '1 scoop', 50);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Tarator')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 25, '1 drizzle', 60);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Pomegranate')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 15, '1 spoon', 70);
  ELSE
    SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Pomegranate seeds')) LIMIT 1;
    IF raw_id IS NOT NULL THEN
      INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
      VALUES (mi_id, raw_id, 15, '1 spoon', 70);
    END IF;
  END IF;

  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Parsley')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 1, '1 pinch', 80);
  END IF;

END $$;

-- Rapportage
SELECT
  mi.category,
  mi.subcategory,
  mi.name,
  COUNT(mic.id) AS components
FROM menu_items mi
LEFT JOIN menu_item_components mic ON mic.menu_item_id = mi.id
GROUP BY mi.category, mi.subcategory, mi.name, mi.display_order
ORDER BY mi.display_order;

-- 228 — Model audit 11-09-2026: recipe and value fixes (R-01…R-08, N-03, N-05, C-01, C-05, D-05…D-11, D-13)
-- NOT YET APPLIED to production (11-09-2026): blocked by the auto-mode safety classifier; apply via psql or Supabase SQL editor.
-- All quantities in grams. Every raw ingredient is referenced by name on the canonical location.

CREATE OR REPLACE FUNCTION fn_canonical_raw_id(p_name text) RETURNS uuid LANGUAGE plpgsql VOLATILE AS $$
DECLARE v uuid;
BEGIN
  SELECT r.id INTO v FROM raw_ingredients r JOIN locations l ON l.id = r.location_id
   WHERE l.is_canonical AND lower(btrim(r.name)) = lower(btrim(p_name)) LIMIT 1;
  IF v IS NULL THEN RAISE EXCEPTION 'canonical raw ingredient not found: %', p_name; END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION fn_prep_id(p_name text) RETURNS uuid LANGUAGE plpgsql VOLATILE AS $$
DECLARE v uuid;
BEGIN
  SELECT id INTO v FROM prep_items WHERE lower(btrim(name)) = lower(btrim(p_name)) LIMIT 1;
  IF v IS NULL THEN RAISE EXCEPTION 'prep item not found: %', p_name; END IF;
  RETURN v;
END $$;

-- upsert helper for a raw-ingredient recipe line (global recipe: one line per ingredient)
CREATE OR REPLACE FUNCTION fn_set_recipe_line(p_prep text, p_ingredient text, p_qty numeric, p_cost_only boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE pid uuid := fn_prep_id(p_prep); rid uuid := fn_canonical_raw_id(p_ingredient); existing uuid;
BEGIN
  SELECT pii.id INTO existing FROM prep_item_ingredients pii JOIN raw_ingredients r ON r.id = pii.raw_ingredient_id
   WHERE pii.prep_item_id = pid AND lower(btrim(r.name)) = lower(btrim(p_ingredient)) LIMIT 1;
  IF existing IS NULL THEN
    INSERT INTO prep_item_ingredients(prep_item_id, raw_ingredient_id, quantity_per_unit, cost_only) VALUES (pid, rid, p_qty, p_cost_only);
  ELSE
    UPDATE prep_item_ingredients SET raw_ingredient_id = rid, quantity_per_unit = p_qty, cost_only = p_cost_only, updated_at = now() WHERE id = existing;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION fn_set_subprep_line(p_prep text, p_sub text, p_qty numeric, p_cost_only boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE pid uuid := fn_prep_id(p_prep); sid uuid := fn_prep_id(p_sub); existing uuid;
BEGIN
  SELECT id INTO existing FROM prep_item_ingredients WHERE prep_item_id = pid AND sub_prep_item_id = sid LIMIT 1;
  IF existing IS NULL THEN
    INSERT INTO prep_item_ingredients(prep_item_id, sub_prep_item_id, quantity_per_unit, cost_only) VALUES (pid, sid, p_qty, p_cost_only);
  ELSE
    UPDATE prep_item_ingredients SET quantity_per_unit = p_qty, cost_only = p_cost_only, updated_at = now() WHERE id = existing;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION fn_set_nutrition(p_ingredient text, kcal numeric, fat numeric, sat numeric, carbs numeric, sugar numeric, fiber numeric, protein numeric, salt numeric, p_source text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE rid uuid := fn_canonical_raw_id(p_ingredient);
BEGIN
  IF EXISTS (SELECT 1 FROM ingredient_nutritional_values WHERE raw_ingredient_id = rid) THEN
    UPDATE ingredient_nutritional_values SET kcal_per_100g = kcal, fat_g = fat, sat_fat_g = sat, carbs_g = carbs, sugar_g = sugar,
      fiber_g = fiber, protein_g = protein, salt_g = salt, source = p_source, source_type = 'supplier_spec', source_priority = 20, updated_at = now()
    WHERE raw_ingredient_id = rid;
  ELSE
    INSERT INTO ingredient_nutritional_values(raw_ingredient_id, kcal_per_100g, fat_g, sat_fat_g, carbs_g, sugar_g, fiber_g, protein_g, salt_g, source, source_type, source_priority)
    VALUES (rid, kcal, fat, sat, carbs, sugar, fiber, protein, salt, p_source, 'supplier_spec', 20);
  END IF;
END $$;

-- ingredients that exist at every real location (like all others)
CREATE OR REPLACE FUNCTION fn_ensure_raw_ingredient(p_name text, p_unit text, p_kind text DEFAULT 'food')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE l record;
BEGIN
  FOR l IN SELECT id FROM locations LOOP
    IF NOT EXISTS (SELECT 1 FROM raw_ingredients WHERE location_id = l.id AND lower(btrim(name)) = lower(btrim(p_name))) THEN
      INSERT INTO raw_ingredients(name, unit, location_id, item_kind, stocktake_visible) VALUES (p_name, p_unit, l.id, p_kind, false);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE bidfood uuid; v uuid;
BEGIN
  -- 0. new ingredients ----------------------------------------------------------------------
  PERFORM fn_ensure_raw_ingredient('Water', 'g');
  PERFORM fn_ensure_raw_ingredient('Onion powder', 'g');
  PERFORM fn_ensure_raw_ingredient('Paprika (sweet)', 'g');
  PERFORM fn_ensure_raw_ingredient('Paprika (smoked)', 'g');
  PERFORM fn_ensure_raw_ingredient('Baharat', 'g');
  PERFORM fn_ensure_raw_ingredient('Marie-Stella-Maris 50cl', 'pcs');

  -- 1. nutrition values (per 100 g / ml) -----------------------------------------------------
  PERFORM fn_set_nutrition('Aubergine puree',   35, 0.2, 0,   6.2, 3.2, 2.5, 0.8, 1.1,   'Product label (Marc, 11-09-2026), 147 kJ');
  PERFORM fn_set_nutrition('Rice parboiled',   355, 0.8, 0.2, 79,  0.3, 1.5, 7.3, 0.015, 'Product label (Marc, 11-09-2026), 1509 kJ');
  PERFORM fn_set_nutrition('Coca Cola',         43, 0,   0,   10.6,10.6,0,   0,   0,     'Product label (Marc, 11-09-2026), 180 kJ');
  PERFORM fn_set_nutrition('Coca Cola Zero',   0.3, 0,   0,   0,   0,   0,   0,   0.01,  'Product label (Marc, 11-09-2026), 1.3 kJ');
  PERFORM fn_set_nutrition('Marie-Stella-Maris 50cl', 0, 0, 0, 0, 0, 0, 0, 0,          'Water');
  PERFORM fn_set_nutrition('Water',              0, 0,   0,   0,   0,   0,   0,   0,     'Water');
  PERFORM fn_set_nutrition('Xantana',          330, 0,   0,   80,  0,   80,  2.5, 0,     'Texturas label (Marc, 11-09-2026), 1400 kJ');
  PERFORM fn_set_nutrition('Lemon juice',       23, 0,   0,   1.1, 0.2, 0,   0.3, 0.01,  'Product label (Marc, 11-09-2026), 97 kJ');
  PERFORM fn_set_nutrition('Tahini',           558, 62,  9.7, 8.5, 0,   9.16,24.4,0,     'Kasih label (Marc, 11-09-2026)');
  PERFORM fn_set_nutrition('Za''atar',         246, 28,  4.6, 25,  0,   30,  11,  0,     'Tuana label (Marc, 11-09-2026), 1247 kJ');
  PERFORM fn_set_nutrition('Mustard powder',   200, 36.2,2.0, 15.9,0,   12.2,26.1,0,     'Tuana label (Marc, 11-09-2026), 909 kJ');
  PERFORM fn_set_nutrition('Flaxseed broken',  530, 42,  3.7, 1.6, 1.5, 27,  18,  0.1,   'Product label (Marc, 11-09-2026), 2200 kJ');
  -- spices from the Mima nutrition sheet (Tuana) — label-derived, no price yet
  PERFORM fn_set_nutrition('Onion powder',     330, 0.5, 0.3, 72,  50,  10,  10,  0,     'Mima sheet 260616 (Tuana)');
  PERFORM fn_set_nutrition('Paprika (sweet)',  320, 13,  2,   54,  10,  35,  14,  0,     'Mima sheet 260616');
  PERFORM fn_set_nutrition('Paprika (smoked)', 473, 13,  2,   56,  10,  37,  14.7,0,     'Mima sheet 260616 (Tuana)');
  PERFORM fn_set_nutrition('Baharat',          255, 6,   1,   38,  12,  22,  9,   0,     'Mima sheet 260616 (Tuana)');

  -- 2. brownie (R-01): recipe from the recipe-book import (migration 014), names repaired ------
  UPDATE prep_items SET ingredient_qty_is_per_recipe_batch = true, recipe_output_amount = 6757, recipe_output_unit = 'g',
         content_amount = COALESCE(content_amount, 6757), content_unit = COALESCE(content_unit, 'g'), yield_source = 'assumed', updated_at = now()
   WHERE id = fn_prep_id('Tahin brownie dough');
  PERFORM fn_set_recipe_line('Tahin brownie dough', 'Flaxseed broken', 256);
  PERFORM fn_set_recipe_line('Tahin brownie dough', 'Water', 1000);
  PERFORM fn_set_recipe_line('Tahin brownie dough', 'Tahini', 1000);
  PERFORM fn_set_recipe_line('Tahin brownie dough', 'Sugar white', 1500);
  PERFORM fn_set_recipe_line('Tahin brownie dough', 'Sugar brown', 1800);
  PERFORM fn_set_recipe_line('Tahin brownie dough', 'Vanilla extract', 71.2);
  PERFORM fn_set_recipe_line('Tahin brownie dough', 'All purpose flour', 1000);
  PERFORM fn_set_recipe_line('Tahin brownie dough', 'Cacao powder', 70);
  PERFORM fn_set_recipe_line('Tahin brownie dough', 'Salt', 36);
  PERFORM fn_set_recipe_line('Tahin brownie dough', 'Baking powder', 24);
  -- baked brownies: 5 % bake loss (Marc, 01-09-2026)
  UPDATE prep_items SET ingredient_qty_is_per_recipe_batch = true, recipe_output_amount = 6419, recipe_output_unit = 'g',
         yield_source = 'estimated', yield_note = '5% bake loss on 6757 g dough (assumption, 01-09-2026)', updated_at = now()
   WHERE id = fn_prep_id('Brownies');
  PERFORM fn_set_subprep_line('Brownies', 'Tahin brownie dough', 6757);

  -- 3. cauliflower coating (R-03, D-05): cup recipe converted to grams via tbsp weights ------------
  IF NOT EXISTS (SELECT 1 FROM prep_items WHERE name = 'Cauliflower spice mix') THEN
    INSERT INTO prep_items(name, unit, content_amount, content_unit, ingredient_qty_is_per_recipe_batch, recipe_output_amount, recipe_output_unit, yield_source, stocktake_visible, yield_note)
    VALUES ('Cauliflower spice mix', 'g', 2605, 'g', true, 2605, 'g', 'assumed', false, 'Cups→grams via tbsp weights from the Mima nutrition sheet (11-09-2026)');
  END IF;
  PERFORM fn_set_recipe_line('Cauliflower spice mix', 'Cumin', 384);
  PERFORM fn_set_recipe_line('Cauliflower spice mix', 'Coriander (ground)', 576);
  PERFORM fn_set_recipe_line('Cauliflower spice mix', 'Onion powder', 240);
  PERFORM fn_set_recipe_line('Cauliflower spice mix', 'Turmeric', 400);
  PERFORM fn_set_recipe_line('Cauliflower spice mix', 'Paprika (sweet)', 171);
  PERFORM fn_set_recipe_line('Cauliflower spice mix', 'Paprika (smoked)', 192);
  PERFORM fn_set_recipe_line('Cauliflower spice mix', 'Salt', 469);
  PERFORM fn_set_recipe_line('Cauliflower spice mix', 'Baharat', 128);
  PERFORM fn_set_recipe_line('Cauliflower spice mix', 'Black pepper', 36);
  PERFORM fn_set_recipe_line('Cauliflower spice mix', 'Mustard powder', 9);
  IF NOT EXISTS (SELECT 1 FROM prep_items WHERE name = 'Cauliflower coating mix') THEN
    INSERT INTO prep_items(name, unit, content_amount, content_unit, ingredient_qty_is_per_recipe_batch, recipe_output_amount, recipe_output_unit, yield_source, stocktake_visible, yield_note)
    VALUES ('Cauliflower coating mix', 'g', 640, 'g', true, 640, 'g', 'assumed', false, '2 cups spice mix : 3 cups rice flour (Marc, 01-09-2026); 128 g per cup');
  END IF;
  PERFORM fn_set_subprep_line('Cauliflower coating mix', 'Cauliflower spice mix', 256);
  PERFORM fn_set_recipe_line('Cauliflower coating mix', 'Rice flour', 384);
  -- 2 cups of coating mix (≈ 7 g/tbsp → 224 g) on 2 500 g cauliflower; nearly all of it sticks
  PERFORM fn_set_subprep_line('Coated Cauliflower', 'Cauliflower coating mix', 224);

  -- 4. pickles: liquid counts in cost, is poured off (R-04, D-09) ------------------------------------
  PERFORM fn_set_subprep_line('Pickled cabbage', 'Pickling liquid', 2000, true);
  PERFORM fn_set_subprep_line('Pickled onion',   'Pickling liquid', 2000, true);

  -- 5. pita with za'atar (R-05, D-10): batch of 50 pitas = 5 650 g; 1 g oil + 2 g za'atar per pita ---
  UPDATE prep_items SET ingredient_qty_is_per_recipe_batch = true, recipe_output_amount = 5650, recipe_output_unit = 'g', updated_at = now()
   WHERE name IN ('Regular pita with za''atar', 'Wholewheat pita with za''atar');
  PERFORM fn_set_recipe_line('Regular pita with za''atar', 'Pita bread 15 cm', 5500);
  PERFORM fn_set_recipe_line('Regular pita with za''atar', 'Za''atar', 100);
  PERFORM fn_set_recipe_line('Regular pita with za''atar', 'Olive oil', 50);
  PERFORM fn_set_recipe_line('Wholewheat pita with za''atar', 'Whole wheat pita bread 15 cm', 5500);
  PERFORM fn_set_recipe_line('Wholewheat pita with za''atar', 'Za''atar', 100);
  PERFORM fn_set_recipe_line('Wholewheat pita with za''atar', 'Olive oil', 50);

  -- 6. shifka (R-06, D-08): serving basis = product weight; portion 20 g -------------------------------
  UPDATE prep_items SET content_amount = 560, content_unit = 'g', updated_at = now() WHERE id = fn_prep_id('Shifka peppers');

  -- 7. aubergine yield to the purchasing implication (~34 %) (C-03) -------------------------------------
  UPDATE prep_items SET recipe_output_amount = 884, recipe_output_unit = 'g', yield_source = 'estimated',
         yield_note = 'Purchasing-implied yield ~34% (theoretical vs actual 01-09-2026); measure (Hadi protocol P1)', updated_at = now()
   WHERE id = fn_prep_id('Aubergine / Sabich');

  -- 8. price rows: cola pack size in grams; Marie-Stella-Maris; Charlie''s pack size (C-01) -------------
  SELECT s.id INTO bidfood FROM suppliers s JOIN locations l ON l.id = s.location_id WHERE l.is_canonical AND s.name = 'Bidfood' LIMIT 1;
  UPDATE ingredient_prices SET pack_size_grams = 7896, pack_size_label = 'Tray 24 x 33CL (7.90 kg)', notes = COALESCE(notes,'') || ' | pack size set to grams 11-09-2026'
   WHERE raw_ingredient_id = fn_canonical_raw_id('Coca Cola') AND pack_size_grams = 24;
  UPDATE ingredient_prices SET pack_size_grams = 3960, pack_size_label = 'Tray 12 x 33CL (3.96 kg)', notes = COALESCE(notes,'') || ' | pack size corrected 11-09-2026'
   WHERE raw_ingredient_id = fn_canonical_raw_id('Charlie''s Orange Mandarin') AND pack_size_grams = 8400;
  IF bidfood IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ingredient_prices WHERE raw_ingredient_id = fn_canonical_raw_id('Marie-Stella-Maris 50cl')) THEN
    INSERT INTO ingredient_prices(raw_ingredient_id, supplier_id, pack_size_grams, pack_size_label, price_cents, price_includes_vat, effective_date, source, notes)
    VALUES (fn_canonical_raw_id('Marie-Stella-Maris 50cl'), bidfood, 9000, 'Tray 18 x 50CL', 1034, false, current_date, 'manual_20260911',
            'Bidfood art 123892/123893 (list 30-08-2026); deposit not included — verify');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ingredient_prices WHERE raw_ingredient_id = fn_canonical_raw_id('Water')) THEN
    INSERT INTO ingredient_prices(raw_ingredient_id, supplier_id, pack_size_grams, pack_size_label, price_cents, price_includes_vat, effective_date, source, notes)
    VALUES (fn_canonical_raw_id('Water'), bidfood, 1000, '1 L tap water', 0, false, current_date, 'manual_20260911', 'tap water, cost 0');
  END IF;

  -- 9. menu items -----------------------------------------------------------------------------------------
  -- loose Flatbread: 70 g (R-07, D-07)
  UPDATE menu_item_components c SET quantity_grams = 70 FROM menu_items m
   WHERE m.id = c.menu_item_id AND m.name = 'Flatbread' AND c.raw_ingredient_id = fn_canonical_raw_id('Frozen flatbreads');
  -- Shifka side: 20 g (D-08)
  UPDATE menu_item_components c SET quantity_grams = 20 FROM menu_items m
   WHERE m.id = c.menu_item_id AND m.name = 'Shifka peppers' AND c.prep_item_id = fn_prep_id('Shifka peppers');
  -- Pita za'atar → via the prep (113 g per pita) instead of raw pita
  UPDATE menu_item_components c SET raw_ingredient_id = NULL, prep_item_id = fn_prep_id('Regular pita with za''atar'), quantity_grams = 113, portion_label = '1 pita with za''atar'
   FROM menu_items m WHERE m.id = c.menu_item_id AND m.name = 'Pita za''atar' AND c.raw_ingredient_id = fn_canonical_raw_id('Pita bread 15 cm');
  -- Mezze Cauliflower: tarator, pomegranate, parsley (Marc, 11-09-2026)
  SELECT id INTO v FROM menu_items WHERE name = 'Mezze Cauliflower';
  IF NOT EXISTS (SELECT 1 FROM menu_item_components WHERE menu_item_id = v AND prep_item_id = fn_prep_id('Tarator')) THEN
    INSERT INTO menu_item_components(menu_item_id, prep_item_id, quantity_grams, portion_label, display_order) VALUES (v, fn_prep_id('Tarator'), 25, '1 drizzle', 20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM menu_item_components WHERE menu_item_id = v AND prep_item_id = fn_prep_id('Pomegranate')) THEN
    INSERT INTO menu_item_components(menu_item_id, prep_item_id, quantity_grams, portion_label, display_order) VALUES (v, fn_prep_id('Pomegranate'), 15, '1 spoon', 21);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM menu_item_components WHERE menu_item_id = v AND raw_ingredient_id = fn_canonical_raw_id('Parsley')) THEN
    INSERT INTO menu_item_components(menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order) VALUES (v, fn_canonical_raw_id('Parsley'), 2, '1 pinch', 22);
  END IF;
  -- drinks (N-04, D-11)
  SELECT id INTO v FROM menu_items WHERE name = 'Coca-Cola';
  IF NOT EXISTS (SELECT 1 FROM menu_item_components WHERE menu_item_id = v) THEN
    INSERT INTO menu_item_components(menu_item_id, raw_ingredient_id, quantity_grams, portion_label) VALUES (v, fn_canonical_raw_id('Coca Cola'), 329, '1 can 33cl');
  END IF;
  SELECT id INTO v FROM menu_items WHERE name = 'Charlies';
  IF NOT EXISTS (SELECT 1 FROM menu_item_components WHERE menu_item_id = v) THEN
    INSERT INTO menu_item_components(menu_item_id, raw_ingredient_id, quantity_grams, portion_label) VALUES (v, fn_canonical_raw_id('Charlie''s Orange Mandarin'), 330, '1 bottle 33cl');
  END IF;
  SELECT id INTO v FROM menu_items WHERE name = 'Marie Stella Maris';
  IF NOT EXISTS (SELECT 1 FROM menu_item_components WHERE menu_item_id = v) THEN
    INSERT INTO menu_item_components(menu_item_id, raw_ingredient_id, quantity_grams, portion_label) VALUES (v, fn_canonical_raw_id('Marie-Stella-Maris 50cl'), 500, '1 bottle 50cl');
  END IF;
  SELECT id INTO v FROM menu_items WHERE name = 'Lemonade';
  IF NOT EXISTS (SELECT 1 FROM menu_item_components WHERE menu_item_id = v) THEN
    INSERT INTO menu_item_components(menu_item_id, prep_item_id, quantity_grams, portion_label) VALUES (v, fn_prep_id('Rose lemonade'), 500, '1 bottle 50cl');
    INSERT INTO menu_item_components(menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order) VALUES (v, fn_canonical_raw_id('Plastic bottle (rose lemonade)'), 1, 'Bottle', 2);
  END IF;
  -- Flatbread chips online price €3.50 (C-05)
  UPDATE menu_item_channel_prices p SET price_cents = 350, updated_at = now() FROM menu_items m
   WHERE m.id = p.menu_item_id AND m.name = 'Flatbread chips' AND p.channel IN ('uber_eats','thuisbezorgd') AND p.price_cents = 600;
END $$;

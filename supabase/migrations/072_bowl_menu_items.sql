-- 072: Bowl menu items met modulaire base-keuze
-- Uitbreiding van menu_item_components met option_group voor keuze-componenten
-- Run na 071.
--
-- Structuur bowl:
--   Vaste componenten (option_group IS NULL): altijd aanwezig (toppings, sauzen, eiwit)
--   Keuze-componenten (option_group = 'base'): klant kiest 1 (of combinatie)
--
-- Bases per bowl (zelfde voor alle eiwitten):
--   - Hummus        150g (3 spoons)
--   - Lettuce        70g (full bowl)
--   - Mudardara     240g (2 scoops)  -- Turmeric rice als alternatief (nog toe te voegen)
--
-- Eiwit + vaste toppings per bowl:
--   Chicken:    Medi salad 110g, Pickled onion 50g, Tzatziki 40g, Grilled chicken 120g, Tarator 25g
--   Falafel:    Medi salad 110g, Pickled cabbage 80g, Falafel 120g (4 pcs), Tarator 15g
--   Sabich:     Medi salad 110g, Pickled cabbage 80g, Egg 60g, Aubergine 80g, Tarator 25g, Amba 25g
--   Cauliflower:Medi salad 110g, Pickled cabbage 80g, Cauliflower 110g, Tarator 25g, Pomegranate 15g

-- ─── Stap 1: Uitbreid menu_item_components met option_group ────────────────────
ALTER TABLE menu_item_components
  ADD COLUMN IF NOT EXISTS option_group TEXT NULL,
  ADD COLUMN IF NOT EXISTS is_optional BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_selected BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN menu_item_components.option_group IS
  'Componenten met dezelfde option_group zijn keuze-alternatieven (bijv. ''base''). NULL = altijd aanwezig.';
COMMENT ON COLUMN menu_item_components.is_optional IS
  'True: klant kiest dit component (onderdeel van een option_group).';
COMMENT ON COLUMN menu_item_components.default_selected IS
  'True: dit is de standaard geselecteerde optie binnen een option_group.';

-- ─── Stap 2: Bowl menu items + componenten ─────────────────────────────────────
DO $$
DECLARE
  mi_id UUID;
  prep_id UUID;
  raw_id UUID;
BEGIN

  -- ─── BOWL CHICKEN ──────────────────────────────────────────────────────────
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Bowl Chicken', 'bowl', 'chicken', true, 90)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING
  RETURNING id INTO mi_id;

  IF mi_id IS NULL THEN
    SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'bowl chicken' LIMIT 1;
  END IF;

  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;

  -- BASIS OPTIES (klant kiest 1 — option_group = 'base')
  -- Hummus
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Hummus')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, option_group, is_optional, default_selected, display_order)
    VALUES (mi_id, prep_id, 150, '3 spoons', 'base', true, true, 10);
  END IF;

  -- Lettuce
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Lettuce')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, option_group, is_optional, default_selected, display_order)
    VALUES (mi_id, prep_id, 70, 'full bowl', 'base', true, false, 20);
  END IF;

  -- Mudardara
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Mudardara')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, option_group, is_optional, default_selected, display_order)
    VALUES (mi_id, prep_id, 240, '2 scoops', 'base', true, false, 30);
  END IF;

  -- Turmeric rice
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Turmeric rice')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, option_group, is_optional, default_selected, display_order)
    VALUES (mi_id, prep_id, 200, '1 scoop', 'base', true, false, 40);
  END IF;

  -- VASTE COMPONENTEN (option_group IS NULL)
  -- Medi salad
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Mediterranean salad / Medi salad')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 110, '1 spoon', 50);
  END IF;

  -- Pickled onion
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Pickled onion')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 50, '1 pinch', 60);
  END IF;

  -- Tzatziki
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Tzatziki')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 40, '1 ladle', 70);
  END IF;

  -- Marinated chicken
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Marinated chicken')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 120, '1 scoop', 80);
  END IF;

  -- Tarator
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Tarator')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 25, '1 drizzle', 90);
  END IF;

  -- Parsley
  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Parsley')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 2, '1 pinch', 100);
  END IF;

  -- ─── BOWL FALAFEL ──────────────────────────────────────────────────────────
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Bowl Falafel', 'bowl', 'falafel', true, 100)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING
  RETURNING id INTO mi_id;

  IF mi_id IS NULL THEN
    SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'bowl falafel' LIMIT 1;
  END IF;

  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;

  -- BASE OPTIES
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Hummus')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, option_group, is_optional, default_selected, display_order)
    VALUES (mi_id, prep_id, 150, '3 spoons', 'base', true, true, 10);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Lettuce')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, option_group, is_optional, default_selected, display_order)
    VALUES (mi_id, prep_id, 70, 'full bowl', 'base', true, false, 20);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Mudardara')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, option_group, is_optional, default_selected, display_order)
    VALUES (mi_id, prep_id, 240, '2 scoops', 'base', true, false, 30);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Turmeric rice')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, option_group, is_optional, default_selected, display_order)
    VALUES (mi_id, prep_id, 200, '1 scoop', 'base', true, false, 40);
  END IF;

  -- VASTE COMPONENTEN
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Mediterranean salad / Medi salad')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 110, '1 spoon', 50);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Pickled cabbage')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 80, '1 pinch', 60);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Falafel')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 120, '4 pcs', 70);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Tarator')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 15, '1 drizzle', 80);
  END IF;

  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Parsley')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 2, '1 pinch', 90);
  END IF;

  -- ─── BOWL SABICH ──────────────────────────────────────────────────────────
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Bowl Sabich', 'bowl', 'sabich', true, 110)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING
  RETURNING id INTO mi_id;

  IF mi_id IS NULL THEN
    SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'bowl sabich' LIMIT 1;
  END IF;

  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;

  -- BASE OPTIES
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Hummus')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, option_group, is_optional, default_selected, display_order)
    VALUES (mi_id, prep_id, 150, '3 spoons', 'base', true, true, 10);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Lettuce')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, option_group, is_optional, default_selected, display_order)
    VALUES (mi_id, prep_id, 70, 'full bowl', 'base', true, false, 20);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Mudardara')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, option_group, is_optional, default_selected, display_order)
    VALUES (mi_id, prep_id, 240, '2 scoops', 'base', true, false, 30);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Turmeric rice')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, option_group, is_optional, default_selected, display_order)
    VALUES (mi_id, prep_id, 200, '1 scoop', 'base', true, false, 40);
  END IF;

  -- VASTE COMPONENTEN
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Mediterranean salad / Medi salad')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 110, '1 spoon', 50);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Pickled cabbage')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 80, '1 pinch', 60);
  END IF;

  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Eggs')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 60, '1 egg', 70);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Aubergine / Sabich')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 80, '1 scoop', 80);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Tarator')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 25, '1 drizzle', 90);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Amba')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 25, '1 drizzle', 100);
  END IF;

  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Parsley')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 2, '1 pinch', 110);
  END IF;

  -- ─── BOWL CAULIFLOWER ─────────────────────────────────────────────────────
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Bowl Cauliflower', 'bowl', 'cauliflower', true, 120)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING
  RETURNING id INTO mi_id;

  IF mi_id IS NULL THEN
    SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'bowl cauliflower' LIMIT 1;
  END IF;

  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;

  -- BASE OPTIES
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Hummus')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, option_group, is_optional, default_selected, display_order)
    VALUES (mi_id, prep_id, 150, '3 spoons', 'base', true, true, 10);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Lettuce')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, option_group, is_optional, default_selected, display_order)
    VALUES (mi_id, prep_id, 70, 'full bowl', 'base', true, false, 20);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Mudardara')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, option_group, is_optional, default_selected, display_order)
    VALUES (mi_id, prep_id, 240, '2 scoops', 'base', true, false, 30);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Turmeric rice')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, option_group, is_optional, default_selected, display_order)
    VALUES (mi_id, prep_id, 200, '1 scoop', 'base', true, false, 40);
  END IF;

  -- VASTE COMPONENTEN
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Mediterranean salad / Medi salad')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 110, '1 spoon', 50);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Pickled cabbage')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 80, '1 pinch', 60);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Coated Cauliflower')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 110, '1 scoop', 70);
  END IF;

  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Tarator')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 25, '1 drizzle', 80);
  END IF;

  -- Pomegranate
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Pomegranate')) LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 15, '1 spoon', 90);
  ELSE
    SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Pomegranate seeds')) LIMIT 1;
    IF raw_id IS NOT NULL THEN
      INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
      VALUES (mi_id, raw_id, 15, '1 spoon', 90);
    END IF;
  END IF;

  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Parsley')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 2, '1 pinch', 100);
  END IF;

END $$;

-- ─── Rapportage ────────────────────────────────────────────────────────────────
SELECT
  mi.category,
  mi.name,
  COUNT(mic.id) FILTER (WHERE mic.option_group = 'base') AS base_opties,
  COUNT(mic.id) FILTER (WHERE mic.option_group IS NULL) AS vaste_componenten
FROM menu_items mi
LEFT JOIN menu_item_components mic ON mic.menu_item_id = mi.id
WHERE mi.category = 'bowl'
GROUP BY mi.category, mi.name, mi.display_order
ORDER BY mi.display_order;

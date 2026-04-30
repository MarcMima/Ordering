-- 074: Correcte portiegrammen voor alle menu items
-- Geen aannames over interne recepten voor mezze/sides.
-- De component-breakdown wordt ingevuld via Admin → Menu in de app.
-- Run na 073.

-- ─── Turmeric rice base opties corrigeren (zelfde als Mudardara) ──────────────
DO $$
DECLARE
  turmeric_id  UUID;
  hummus_id    UUID;
  mudardara_id UUID;
  lettuce_id   UUID;
BEGIN
  SELECT id INTO turmeric_id  FROM prep_items WHERE lower(btrim(name)) = 'turmeric rice' LIMIT 1;
  SELECT id INTO hummus_id    FROM prep_items WHERE lower(btrim(name)) = 'hummus' LIMIT 1;
  SELECT id INTO mudardara_id FROM prep_items WHERE lower(btrim(name)) = 'mudardara' LIMIT 1;
  SELECT id INTO lettuce_id   FROM prep_items WHERE lower(btrim(name)) = 'lettuce' LIMIT 1;

  -- Solo: 240g
  UPDATE bowl_base_options SET total_grams = 240 WHERE name = 'turmeric_rice';
  UPDATE bowl_base_components SET quantity_grams = 240, portion_label = '2 scoops'
    WHERE base_option_id = (SELECT id FROM bowl_base_options WHERE name = 'turmeric_rice')
      AND prep_item_id = turmeric_id;

  -- Hummus + Turmeric rice: 100 + 120 = 220g
  UPDATE bowl_base_options SET total_grams = 220 WHERE name = 'hummus_turmeric_rice';
  UPDATE bowl_base_components SET quantity_grams = 100, portion_label = '2 spoons'
    WHERE base_option_id = (SELECT id FROM bowl_base_options WHERE name = 'hummus_turmeric_rice')
      AND prep_item_id = hummus_id;
  UPDATE bowl_base_components SET quantity_grams = 120, portion_label = '1 scoop'
    WHERE base_option_id = (SELECT id FROM bowl_base_options WHERE name = 'hummus_turmeric_rice')
      AND prep_item_id = turmeric_id;

  -- Mudardara + Turmeric rice: 120 + 120 = 240g
  UPDATE bowl_base_options SET total_grams = 240 WHERE name = 'mudardara_turmeric_rice';
  UPDATE bowl_base_components SET quantity_grams = 120, portion_label = '1 scoop'
    WHERE base_option_id = (SELECT id FROM bowl_base_options WHERE name = 'mudardara_turmeric_rice')
      AND prep_item_id = mudardara_id;
  UPDATE bowl_base_components SET quantity_grams = 120, portion_label = '1 scoop'
    WHERE base_option_id = (SELECT id FROM bowl_base_options WHERE name = 'mudardara_turmeric_rice')
      AND prep_item_id = turmeric_id;

  -- Lettuce + Turmeric rice: 40 + 120 = 160g
  UPDATE bowl_base_options SET total_grams = 160 WHERE name = 'lettuce_turmeric_rice';
  UPDATE bowl_base_components SET quantity_grams = 40, portion_label = 'rest'
    WHERE base_option_id = (SELECT id FROM bowl_base_options WHERE name = 'lettuce_turmeric_rice')
      AND prep_item_id = lettuce_id;
  UPDATE bowl_base_components SET quantity_grams = 120, portion_label = '1 scoop'
    WHERE base_option_id = (SELECT id FROM bowl_base_options WHERE name = 'lettuce_turmeric_rice')
      AND prep_item_id = turmeric_id;
END $$;

-- ─── Lentil soup: pita verwijderen ────────────────────────────────────────────
DELETE FROM menu_item_components mic
USING menu_items mi, raw_ingredients ri
WHERE mic.menu_item_id = mi.id
  AND mic.raw_ingredient_id = ri.id
  AND lower(btrim(mi.name)) = 'lentil soup'
  AND lower(btrim(ri.name)) = 'pita bread 15 cm';

-- ─── Portiegrammen bijwerken op bestaande componenten ─────────────────────────
-- Alleen items waarvan de primaire grondstof al bekend is.
-- Sub-breakdowns (bijv. mezze chicken = chicken + onion + peterselie) worden
-- NIET ingevuld — dat doe je zelf via Admin → Menu.

CREATE OR REPLACE PROCEDURE _m074_set_single_prep(IN p_menu TEXT, IN p_prep TEXT, IN p_grams NUMERIC, IN p_label TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  m UUID;
  p UUID;
BEGIN
  SELECT id INTO m FROM menu_items WHERE lower(btrim(name)) = lower(btrim(p_menu)) LIMIT 1;
  SELECT id INTO p FROM prep_items WHERE lower(btrim(name)) = lower(btrim(p_prep)) LIMIT 1;
  IF m IS NULL OR p IS NULL THEN RETURN; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = m AND option_group IS NULL;
  INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
  VALUES (m, p, p_grams, p_label, 10);
END;
$$;

CREATE OR REPLACE PROCEDURE _m074_set_single_raw(IN p_menu TEXT, IN p_raw TEXT, IN p_grams NUMERIC, IN p_label TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  m UUID;
  r UUID;
BEGIN
  SELECT id INTO m FROM menu_items WHERE lower(btrim(name)) = lower(btrim(p_menu)) LIMIT 1;
  SELECT id INTO r FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim(p_raw)) LIMIT 1;
  IF m IS NULL OR r IS NULL THEN RETURN; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = m AND option_group IS NULL;
  INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
  VALUES (m, r, p_grams, p_label, 10);
END;
$$;

-- ── Mezze: één primaire component als startpunt ──────────────────────────────
-- Verdere breakdown is jouw taak via Admin → Menu.
CALL _m074_set_single_prep('Mezze Falafel',         'Falafel',            200, '1 portion');
CALL _m074_set_single_prep('Mezze Cauliflower',     'Coated Cauliflower', 200, '1 portion');
CALL _m074_set_single_prep('Mezze Aubergine',       'Aubergine / Sabich', 200, '1 portion');
CALL _m074_set_single_prep('Mezze Grilled chicken', 'Marinated chicken',  200, '1 portion');
CALL _m074_set_single_prep('Mezze Tzatziki',        'Tzatziki',           210, '1 mezze cup');
CALL _m074_set_single_prep('Mezze Baba ganoush',    'Babe Ghanouj',       210, '1 mezze cup');
CALL _m074_set_single_prep('Mezze Hummus',          'Hummus',             210, '1 mezze cup');

-- ── Sides ────────────────────────────────────────────────────────────────────
CALL _m074_set_single_prep('Pickled cabbage', 'Pickled cabbage', 120, '1 side');
CALL _m074_set_single_prep('Pickled onions',  'Pickled onion',   120, '1 side');
CALL _m074_set_single_prep('Amba',            'Amba',             41, '1 sauce cup');
CALL _m074_set_single_prep('Tarator',         'Tarator',          41, '1 sauce cup');
CALL _m074_set_single_prep('Shrug',           'Srug',             41, '1 sauce cup');
CALL _m074_set_single_prep('Tzatziki',        'Tzatziki',         41, '1 sauce cup');
CALL _m074_set_single_prep('Tabbouleh',       'Tabbouleh',        150, '1 side');

-- ── Bread ─────────────────────────────────────────────────────────────────────
CALL _m074_set_single_raw('Flatbread', 'Flatbread', 100, '1 flatbread');

-- ── Snacks & desserts ─────────────────────────────────────────────────────────
CALL _m074_set_single_prep('Brownie',         'Brownies',                95, '1 piece');
CALL _m074_set_single_prep('Flatbread chips', 'Za''atar flatbread chips', 87, '1 bag');

-- ── Warm ─────────────────────────────────────────────────────────────────────
CALL _m074_set_single_prep('Lentil soup', 'Lebanese lentil soup', 400, '1 bowl');

DROP PROCEDURE IF EXISTS _m074_set_single_prep(text, text, numeric, text);
DROP PROCEDURE IF EXISTS _m074_set_single_raw(text, text, numeric, text);

-- Pita za'atar: pita als enige bekende component; rest open laten
DO $$
DECLARE mi_id UUID; r_id UUID;
BEGIN
  SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'pita za''atar' LIMIT 1;
  IF mi_id IS NULL THEN RETURN; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id AND option_group IS NULL;
  SELECT id INTO r_id FROM raw_ingredients WHERE lower(btrim(name)) = 'pita bread 15 cm' LIMIT 1;
  IF r_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, r_id, 100, '1 pita', 10);
  END IF;
  -- Za'atar, olie: invullen via Admin → Menu
END $$;

-- ─── Rapportage ────────────────────────────────────────────────────────────────
SELECT
  mi.category,
  mi.name,
  COUNT(mic.id) FILTER (WHERE mic.option_group IS NULL) AS componenten,
  COUNT(mic.id) FILTER (WHERE mic.option_group = 'base') AS base_opties
FROM menu_items mi
LEFT JOIN menu_item_components mic ON mic.menu_item_id = mi.id
GROUP BY mi.category, mi.name, mi.display_order
ORDER BY mi.display_order;

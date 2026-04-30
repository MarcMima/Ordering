-- 073: Bowl base opties (single + combinaties) + complete menukaart
-- Vervangt de option_group aanpak uit 072 voor bases.
-- Run na 072.
--
-- PROBLEEM MET 072: option_group kon niet uitdrukken dat combinaties andere grammen hebben.
--   Hummus solo = 150g, maar Hummus in combo = 100g.
--   Lettuce solo = 70g, maar Lettuce in combo = 40g.
--
-- OPLOSSING: aparte tabel bowl_base_options (elke keuzeoptie is een rij)
--   met bowl_base_components (welke prep items + grammen per optie).
--   menu_item_components verwijst voor de base naar bowl_base_option_id.

-- ─── Stap 1: Bowl base opties tabel ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bowl_base_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,        -- interne naam: 'hummus', 'hummus_mudardara', etc.
  display_name TEXT NOT NULL,       -- menukaart: 'Hummus', 'Hummus / Mudardara', etc.
  total_grams NUMERIC NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS bowl_base_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_option_id UUID NOT NULL REFERENCES bowl_base_options(id) ON DELETE CASCADE,
  prep_item_id UUID NOT NULL REFERENCES prep_items(id) ON DELETE CASCADE,
  quantity_grams NUMERIC NOT NULL,
  portion_label TEXT
);

COMMENT ON TABLE bowl_base_options IS
  'Keuze-opties voor de bowl base. Elke optie is óf een enkele base, óf een combinatie van twee.';
COMMENT ON TABLE bowl_base_components IS
  'Welke prep items (en grammen) horen bij een bowl base optie.';

ALTER TABLE bowl_base_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE bowl_base_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bowl_base_options_all" ON bowl_base_options FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "bowl_base_components_all" ON bowl_base_components FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "bowl_base_options_anon_read" ON bowl_base_options FOR SELECT TO anon USING (true);
CREATE POLICY "bowl_base_components_anon_read" ON bowl_base_components FOR SELECT TO anon USING (true);

-- ─── Stap 2: Referentie vanuit menu_item_components naar bowl_base_option ──────
-- Bowls verwijzen nu naar een base_option in plaats van losse prep items.
ALTER TABLE menu_item_components
  ADD COLUMN IF NOT EXISTS bowl_base_option_id UUID REFERENCES bowl_base_options(id) ON DELETE SET NULL;

-- Constraint: ofwel prep_item_id, ofwel raw_ingredient_id, ofwel bowl_base_option_id
ALTER TABLE menu_item_components
  DROP CONSTRAINT IF EXISTS menu_item_component_has_source;
ALTER TABLE menu_item_components
  ADD CONSTRAINT menu_item_component_has_source
    CHECK (
      prep_item_id IS NOT NULL
      OR raw_ingredient_id IS NOT NULL
      OR bowl_base_option_id IS NOT NULL
    );

-- ─── Stap 3: Verwijder de losse base-componenten uit 072 (option_group aanpak) ─
DELETE FROM menu_item_components WHERE option_group = 'base';

-- ─── Stap 4: Vul bowl_base_options en bowl_base_components ────────────────────
DO $$
DECLARE
  bo_id UUID;
  prep_id UUID;

  -- Hulp: zoek prep item
  hummus_id UUID;
  lettuce_id UUID;
  mudardara_id UUID;
  turmeric_id UUID;
BEGIN
  SELECT id INTO hummus_id   FROM prep_items WHERE lower(btrim(name)) = 'hummus' LIMIT 1;
  SELECT id INTO lettuce_id  FROM prep_items WHERE lower(btrim(name)) = 'lettuce' LIMIT 1;
  SELECT id INTO mudardara_id FROM prep_items WHERE lower(btrim(name)) = 'mudardara' LIMIT 1;
  SELECT id INTO turmeric_id FROM prep_items WHERE lower(btrim(name)) = 'turmeric rice' LIMIT 1;

  -- ── SINGLE BASES ────────────────────────────────────────────────────────────

  -- Hummus solo (150g)
  INSERT INTO bowl_base_options (name, display_name, total_grams, display_order)
  VALUES ('hummus', 'Hummus', 150, 10)
  ON CONFLICT (name) DO UPDATE SET display_name=EXCLUDED.display_name, total_grams=EXCLUDED.total_grams
  RETURNING id INTO bo_id;
  DELETE FROM bowl_base_components WHERE base_option_id = bo_id;
  IF hummus_id IS NOT NULL THEN
    INSERT INTO bowl_base_components (base_option_id, prep_item_id, quantity_grams, portion_label)
    VALUES (bo_id, hummus_id, 150, '3 spoons');
  END IF;

  -- Lettuce solo (70g)
  INSERT INTO bowl_base_options (name, display_name, total_grams, display_order)
  VALUES ('lettuce', 'Lettuce', 70, 20)
  ON CONFLICT (name) DO UPDATE SET display_name=EXCLUDED.display_name, total_grams=EXCLUDED.total_grams
  RETURNING id INTO bo_id;
  DELETE FROM bowl_base_components WHERE base_option_id = bo_id;
  IF lettuce_id IS NOT NULL THEN
    INSERT INTO bowl_base_components (base_option_id, prep_item_id, quantity_grams, portion_label)
    VALUES (bo_id, lettuce_id, 70, 'full bowl');
  END IF;

  -- Mudardara solo (240g)
  INSERT INTO bowl_base_options (name, display_name, total_grams, display_order)
  VALUES ('mudardara', 'Mudardara', 240, 30)
  ON CONFLICT (name) DO UPDATE SET display_name=EXCLUDED.display_name, total_grams=EXCLUDED.total_grams
  RETURNING id INTO bo_id;
  DELETE FROM bowl_base_components WHERE base_option_id = bo_id;
  IF mudardara_id IS NOT NULL THEN
    INSERT INTO bowl_base_components (base_option_id, prep_item_id, quantity_grams, portion_label)
    VALUES (bo_id, mudardara_id, 240, '2 scoops');
  END IF;

  -- Turmeric rice solo (~200g, nog bevestigen)
  INSERT INTO bowl_base_options (name, display_name, total_grams, display_order)
  VALUES ('turmeric_rice', 'Turmeric rice', 200, 40)
  ON CONFLICT (name) DO UPDATE SET display_name=EXCLUDED.display_name, total_grams=EXCLUDED.total_grams
  RETURNING id INTO bo_id;
  DELETE FROM bowl_base_components WHERE base_option_id = bo_id;
  IF turmeric_id IS NOT NULL THEN
    INSERT INTO bowl_base_components (base_option_id, prep_item_id, quantity_grams, portion_label)
    VALUES (bo_id, turmeric_id, 200, '1 scoop');
  END IF;

  -- ── COMBINATIES (2 bases, kleinere porties) ─────────────────────────────────

  -- Hummus + Lettuce (100 + 40 = 140g)
  INSERT INTO bowl_base_options (name, display_name, total_grams, display_order)
  VALUES ('hummus_lettuce', 'Hummus / Lettuce', 140, 50)
  ON CONFLICT (name) DO UPDATE SET display_name=EXCLUDED.display_name, total_grams=EXCLUDED.total_grams
  RETURNING id INTO bo_id;
  DELETE FROM bowl_base_components WHERE base_option_id = bo_id;
  IF hummus_id IS NOT NULL THEN
    INSERT INTO bowl_base_components (base_option_id, prep_item_id, quantity_grams, portion_label)
    VALUES (bo_id, hummus_id, 100, '2 spoons');
  END IF;
  IF lettuce_id IS NOT NULL THEN
    INSERT INTO bowl_base_components (base_option_id, prep_item_id, quantity_grams, portion_label)
    VALUES (bo_id, lettuce_id, 40, 'rest');
  END IF;

  -- Hummus + Mudardara (100 + 120 = 220g)
  INSERT INTO bowl_base_options (name, display_name, total_grams, display_order)
  VALUES ('hummus_mudardara', 'Hummus / Mudardara', 220, 60)
  ON CONFLICT (name) DO UPDATE SET display_name=EXCLUDED.display_name, total_grams=EXCLUDED.total_grams
  RETURNING id INTO bo_id;
  DELETE FROM bowl_base_components WHERE base_option_id = bo_id;
  IF hummus_id IS NOT NULL THEN
    INSERT INTO bowl_base_components (base_option_id, prep_item_id, quantity_grams, portion_label)
    VALUES (bo_id, hummus_id, 100, '2 spoons');
  END IF;
  IF mudardara_id IS NOT NULL THEN
    INSERT INTO bowl_base_components (base_option_id, prep_item_id, quantity_grams, portion_label)
    VALUES (bo_id, mudardara_id, 120, '1 scoop');
  END IF;

  -- Mudardara + Lettuce (120 + 40 = 160g)
  INSERT INTO bowl_base_options (name, display_name, total_grams, display_order)
  VALUES ('mudardara_lettuce', 'Mudardara / Lettuce', 160, 70)
  ON CONFLICT (name) DO UPDATE SET display_name=EXCLUDED.display_name, total_grams=EXCLUDED.total_grams
  RETURNING id INTO bo_id;
  DELETE FROM bowl_base_components WHERE base_option_id = bo_id;
  IF mudardara_id IS NOT NULL THEN
    INSERT INTO bowl_base_components (base_option_id, prep_item_id, quantity_grams, portion_label)
    VALUES (bo_id, mudardara_id, 120, '1 scoop');
  END IF;
  IF lettuce_id IS NOT NULL THEN
    INSERT INTO bowl_base_components (base_option_id, prep_item_id, quantity_grams, portion_label)
    VALUES (bo_id, lettuce_id, 40, 'rest');
  END IF;

  -- Hummus + Turmeric rice (100 + 120 = 220g, aanname — bevestig grammen)
  INSERT INTO bowl_base_options (name, display_name, total_grams, display_order)
  VALUES ('hummus_turmeric_rice', 'Hummus / Turmeric rice', 220, 80)
  ON CONFLICT (name) DO UPDATE SET display_name=EXCLUDED.display_name, total_grams=EXCLUDED.total_grams
  RETURNING id INTO bo_id;
  DELETE FROM bowl_base_components WHERE base_option_id = bo_id;
  IF hummus_id IS NOT NULL THEN
    INSERT INTO bowl_base_components (base_option_id, prep_item_id, quantity_grams, portion_label)
    VALUES (bo_id, hummus_id, 100, '2 spoons');
  END IF;
  IF turmeric_id IS NOT NULL THEN
    INSERT INTO bowl_base_components (base_option_id, prep_item_id, quantity_grams, portion_label)
    VALUES (bo_id, turmeric_id, 120, '1 scoop');
  END IF;

  -- Mudardara + Turmeric rice (120 + 80 = 200g, aanname)
  INSERT INTO bowl_base_options (name, display_name, total_grams, display_order)
  VALUES ('mudardara_turmeric_rice', 'Mudardara / Turmeric rice', 200, 90)
  ON CONFLICT (name) DO UPDATE SET display_name=EXCLUDED.display_name, total_grams=EXCLUDED.total_grams
  RETURNING id INTO bo_id;
  DELETE FROM bowl_base_components WHERE base_option_id = bo_id;
  IF mudardara_id IS NOT NULL THEN
    INSERT INTO bowl_base_components (base_option_id, prep_item_id, quantity_grams, portion_label)
    VALUES (bo_id, mudardara_id, 120, '1 scoop');
  END IF;
  IF turmeric_id IS NOT NULL THEN
    INSERT INTO bowl_base_components (base_option_id, prep_item_id, quantity_grams, portion_label)
    VALUES (bo_id, turmeric_id, 80, 'rest');
  END IF;

  -- Lettuce + Turmeric rice (40 + 120 = 160g, aanname)
  INSERT INTO bowl_base_options (name, display_name, total_grams, display_order)
  VALUES ('lettuce_turmeric_rice', 'Lettuce / Turmeric rice', 160, 100)
  ON CONFLICT (name) DO UPDATE SET display_name=EXCLUDED.display_name, total_grams=EXCLUDED.total_grams
  RETURNING id INTO bo_id;
  DELETE FROM bowl_base_components WHERE base_option_id = bo_id;
  IF lettuce_id IS NOT NULL THEN
    INSERT INTO bowl_base_components (base_option_id, prep_item_id, quantity_grams, portion_label)
    VALUES (bo_id, lettuce_id, 40, 'rest');
  END IF;
  IF turmeric_id IS NOT NULL THEN
    INSERT INTO bowl_base_components (base_option_id, prep_item_id, quantity_grams, portion_label)
    VALUES (bo_id, turmeric_id, 120, '1 scoop');
  END IF;

END $$;

-- ─── Stap 5: Koppel bowl menu items aan base opties ───────────────────────────
-- Verwijder eventuele oude base-rijen en zet één bowl_base_option_id rij per base-optie.
CREATE OR REPLACE PROCEDURE _m073_wire_bowl_bases(IN p_menu_name TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  m_id UUID;
  b_id UUID;
BEGIN
  SELECT id INTO m_id FROM menu_items WHERE lower(btrim(name)) = lower(btrim(p_menu_name)) LIMIT 1;
  IF m_id IS NULL THEN RETURN; END IF;

  DELETE FROM menu_item_components
  WHERE menu_item_id = m_id
    AND (option_group = 'base' OR bowl_base_option_id IS NOT NULL);

  FOR b_id IN SELECT id FROM bowl_base_options ORDER BY display_order
  LOOP
    INSERT INTO menu_item_components (menu_item_id, bowl_base_option_id, quantity_grams, is_optional, option_group, display_order)
    SELECT m_id, b_id, total_grams, true, 'base', display_order
    FROM bowl_base_options WHERE id = b_id;
  END LOOP;
END;
$$;

CALL _m073_wire_bowl_bases('Bowl Chicken');
CALL _m073_wire_bowl_bases('Bowl Falafel');
CALL _m073_wire_bowl_bases('Bowl Sabich');
CALL _m073_wire_bowl_bases('Bowl Cauliflower');

DROP PROCEDURE IF EXISTS _m073_wire_bowl_bases(text);

-- ─── Stap 6: Overige menukaart items ──────────────────────────────────────────
DO $$
DECLARE
  mi_id UUID;
  prep_id UUID;
  raw_id UUID;
BEGIN

  -- ── MEZZE ──────────────────────────────────────────────────────────────────
  -- Mezze zijn enkelvoudige prep items in een kleiner formaat (mezze portie)
  -- Gram-hoeveelheden zijn schattingen; aanpassen in Admin wanneer exact bekend.

  -- Mezze Falafel
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Mezze Falafel', 'mezze', 'falafel', true, 200)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'mezze falafel' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'falafel' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 120, '4 pcs', 10);
  END IF;
  -- Tarator bij falafel
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'tarator' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 30, '1 drizzle', 20);
  END IF;

  -- Mezze Cauliflower shawarma
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Mezze Cauliflower', 'mezze', 'cauliflower', true, 210)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'mezze cauliflower' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'coated cauliflower' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 150, '1 scoop', 10);
  END IF;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'tarator' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 30, '1 drizzle', 20);
  END IF;

  -- Mezze Aubergine
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Mezze Aubergine', 'mezze', 'aubergine', true, 220)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'mezze aubergine' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'aubergine / sabich' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 150, '1 scoop', 10);
  END IF;

  -- Mezze Grilled chicken
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Mezze Grilled chicken', 'mezze', 'chicken', true, 230)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'mezze grilled chicken' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'marinated chicken' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 150, '1 scoop', 10);
  END IF;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'tzatziki' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 40, '1 ladle', 20);
  END IF;

  -- Mezze Tzatziki
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Mezze Tzatziki', 'mezze', 'tzatziki', true, 240)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'mezze tzatziki' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'tzatziki' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 210, '1 mezze cup', 10);
  END IF;

  -- Mezze Baba ganoush
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Mezze Baba ganoush', 'mezze', 'baba_ganoush', true, 250)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'mezze baba ganoush' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'babe ghanouj' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 210, '1 mezze cup', 10);
  END IF;

  -- Mezze Hummus
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Mezze Hummus', 'mezze', 'hummus', true, 260)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'mezze hummus' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'hummus' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 210, '1 mezze cup', 10);
  END IF;

  -- ── SIDES (enkelvoudige bijgerechten) ───────────────────────────────────────

  -- Pickled cabbage
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Pickled cabbage', 'side', 'pickles', true, 300)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'pickled cabbage' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'pickled cabbage' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 80, '1 side', 10);
  END IF;

  -- Pickled onions
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Pickled onions', 'side', 'pickles', true, 310)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'pickled onions' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'pickled onion' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 80, '1 side', 10);
  END IF;

  -- Amba
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Amba', 'side', 'sauce', true, 320)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'amba' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'amba' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 60, '1 sauce cup', 10);
  END IF;

  -- Tarator
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Tarator', 'side', 'sauce', true, 330)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'tarator' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'tarator' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 60, '1 sauce cup', 10);
  END IF;

  -- Shrug (Srug)
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Shrug', 'side', 'sauce', true, 340)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'shrug' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'srug' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 60, '1 sauce cup', 10);
  END IF;

  -- Tzatziki (als los bijgerecht)
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Tzatziki', 'side', 'sauce', true, 350)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'tzatziki' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'tzatziki' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 100, '1 side', 10);
  END IF;

  -- ── BREAD ───────────────────────────────────────────────────────────────────

  -- Pita za'atar
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Pita za''atar', 'side', 'bread', true, 400)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'pita za''atar' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  -- Pita (raw) + Za'atar (raw)
  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Pita bread 15 cm')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 100, '1 pita', 10);
  END IF;
  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Za''atar')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 10, 'sprinkle', 20);
  END IF;
  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Olive oil')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 10, 'drizzle', 30);
  END IF;

  -- Flatbread (los)
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Flatbread', 'side', 'bread', true, 410)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'flatbread' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Flatbread')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 70, '1 flatbread', 10);
  END IF;

  -- ── SNACKS & DESSERTS ────────────────────────────────────────────────────────

  -- Brownie
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Brownie', 'dessert', 'brownie', true, 500)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'brownie' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'brownies' LIMIT 1;
  IF prep_id IS NULL THEN
    SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'tahin brownie dough' LIMIT 1;
  END IF;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 95, '1 piece', 10);
  END IF;

  -- Flatbread chips
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Flatbread chips', 'snack', 'chips', true, 510)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'flatbread chips' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'za''atar flatbread chips' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 100, '1 bag', 10);
  END IF;

  -- ── WARME GERECHTEN ─────────────────────────────────────────────────────────

  -- Lentil soup
  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Lentil soup', 'warm', 'soup', true, 600)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'lentil soup' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'lebanese lentil soup' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 400, '1 bowl', 10);
  END IF;
  -- Pita erbij
  SELECT id INTO raw_id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Pita bread 15 cm')) LIMIT 1;
  IF raw_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, raw_ingredient_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, raw_id, 100, '1 pita', 20);
  END IF;

  -- Tabbouleh (nieuw prep item, nog niet in DB — voeg toe als placeholder)
  -- Eerst prep item aanmaken als het niet bestaat
  INSERT INTO prep_items (name, unit)
  SELECT 'Tabbouleh', 'g'
  WHERE NOT EXISTS (SELECT 1 FROM prep_items WHERE lower(btrim(name)) = 'tabbouleh');

  INSERT INTO location_prep_items (location_id, prep_item_id, base_quantity)
  SELECT l.id, p.id, 1
  FROM locations l
  CROSS JOIN prep_items p
  WHERE lower(btrim(p.name)) = 'tabbouleh'
  ON CONFLICT (location_id, prep_item_id) DO NOTHING;

  mi_id := NULL;
  INSERT INTO menu_items (name, category, subcategory, active, display_order)
  VALUES ('Tabbouleh', 'side', 'salad', true, 360)
  ON CONFLICT ((lower(btrim(name)))) DO NOTHING RETURNING id INTO mi_id;
  IF mi_id IS NULL THEN SELECT id INTO mi_id FROM menu_items WHERE lower(btrim(name)) = 'tabbouleh' LIMIT 1; END IF;
  DELETE FROM menu_item_components WHERE menu_item_id = mi_id;
  SELECT id INTO prep_id FROM prep_items WHERE lower(btrim(name)) = 'tabbouleh' LIMIT 1;
  IF prep_id IS NOT NULL THEN
    INSERT INTO menu_item_components (menu_item_id, prep_item_id, quantity_grams, portion_label, display_order)
    VALUES (mi_id, prep_id, 150, '1 side', 10);
  END IF;

END $$;

-- ─── Rapportage ────────────────────────────────────────────────────────────────
SELECT
  mi.category,
  COUNT(*) AS aantal_gerechten
FROM menu_items mi
GROUP BY mi.category
ORDER BY mi.category;

SELECT
  bo.display_name,
  bo.total_grams,
  COUNT(bc.id) AS components
FROM bowl_base_options bo
LEFT JOIN bowl_base_components bc ON bc.base_option_id = bo.id
GROUP BY bo.display_name, bo.total_grams, bo.display_order
ORDER BY bo.display_order;

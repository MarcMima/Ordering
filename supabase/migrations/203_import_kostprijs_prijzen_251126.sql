-- 203: Import inkoopprijzen uit Excel-kostprijsmodel 251126_Menu.xlsx (prijspeil 26-11-2025)
-- Fase 2 kostprijsproject. Alleen TOEVOEGEN aan de append-only prijshistorie (ingredient_prices):
--   * geen bestaande prijzen worden aangepast of verwijderd;
--   * effective_date = 2025-11-26, dus elke recentere prijs blijft de "huidige" prijs
--     in ingredient_current_prices (DISTINCT ON ... ORDER BY effective_date DESC);
--   * idempotent via source-tag 'excel_kostprijs_251126';
--   * prijzen zijn EXCLUSIEF BTW (aanname Marc, price_includes_vat = false).
-- Artikelen zonder betrouwbare naam-match komen in kostprijs_import_review
-- en worden NIET geimporteerd; Marc lost die lijst in de app/SQL-editor op.

-- Reviewtabel (additief, blijft staan tot de gaten zijn opgelost)
CREATE TABLE IF NOT EXISTS kostprijs_import_review (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  excel_name TEXT NOT NULL UNIQUE,
  categorie TEXT,
  prijs_ex_btw_eur NUMERIC,
  verpakking TEXT,
  leverancier_excel TEXT,
  kandidaten TEXT,
  opmerking TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE kostprijs_import_review ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kir_anon_read ON kostprijs_import_review;
CREATE POLICY kir_anon_read ON kostprijs_import_review FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS kir_auth_all ON kostprijs_import_review;
CREATE POLICY kir_auth_all ON kostprijs_import_review FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO kostprijs_import_review
  (excel_name, categorie, prijs_ex_btw_eur, verpakking, leverancier_excel, kandidaten, opmerking)
VALUES
    ('Flatbread', 'food', '0.65', '350 g', 'Al Hassnah', 'Frozen flatbreads, Flaxseed broken', 'BTW 9%; '),
    ('Chips bag', 'verpakking', '0.15', '1 stuks', 'GeDe', 'Charlie''s Orange, Chickpeas', 'BTW 21%; '),
    ('330ml bottle', 'verpakking', '0.215', '1 stuks', 'GeDe', NULL, 'BTW 21%; '),
    ('Bowl 500ml', 'verpakking', '83.2', '1000 stuks', 'GeDe', NULL, 'BTW 21%; '),
    ('Bowl 1000ml', 'verpakking', '125', '1000 stuks', 'GeDe', NULL, 'BTW 21%; '),
    ('Bowl 1300ml', 'verpakking', '137.5', '1000 stuks', 'GeDe', NULL, 'BTW 21%; '),
    ('Pet deksel klein', 'verpakking', '65', '1000 stuks', 'GeDe', NULL, 'BTW 21%; '),
    ('Pet deksel groot', 'verpakking', '85', '1000 stuks', 'GeDe', NULL, 'BTW 21%; '),
    ('Container 350cc', 'verpakking', '48.8', '1000 stuks', 'GeDe', 'Soup container, Pita container, Bowl container', 'BTW 21%; '),
    ('Container 350cc - lid', 'verpakking', '13', '1000 stuks', 'GeDe', 'Soup container, Pita container, Bowl container', 'BTW 21%; '),
    ('Papieren tasje', 'verpakking', '128.1', '1000 stuks', 'GeDe', 'Paper bags large, Paper bags small, Catering container', 'BTW 21%; '),
    ('Mint (dried)', 'food', '6.5', '500 g', 'Tuana', 'Mint', 'BTW 9%; '),
    ('Paprika (smoked)', 'food', '14.55', '1000 g', 'Tuana', 'Paper bag (brownies)', 'BTW 9%; '),
    ('Baharat', 'food', '11.9', '1000 g', 'Tuana', NULL, 'BTW 9%; '),
    ('Onion powder', 'food', '10.99', '1000 g', 'Tuana', 'Baking powder, Onion peeled, Chili powder', 'BTW 9%; '),
    ('Paprika (sweet)', 'food', '10.54', '1000 g', 'Tuana', 'Paper bag (brownies)', 'BTW 9%; '),
    ('Beets', 'food', '1.59', '500 g', 'Van Gelder', 'Rose petals, Red lentils', 'BTW 9%; '),
    ('Carrots', 'food', '3.5', '1000 g', 'Van Gelder', 'Carrot julienne, Cardamom', 'BTW 9%; '),
    ('Garlic', 'food', '6.25', '1000 g', 'Van Gelder', 'Garlic puree, Garlic peeled', 'BTW 9%; '),
    ('Spring onion', 'food', '4.95', '500 g', 'Van Gelder', 'Catering container, Soup container, Pita container', 'BTW 9%; '),
    ('Wortelen', 'food', '3.5', '1000 g', 'Van Gelder', 'Red lentils', 'BTW 9%; '),
    ('Chocolate chip', 'food', '46.51', '2500 g', 'Bidfood', 'Coca Cola, Coffee cup, Coca Cola Zero', 'BTW 9%; '),
    ('Marie stella maris', 'drank', '9.4', '18 stuks', 'Bidfood', 'Charlie''s Mandarin, Rice basmati, Middle Eastern pickles', 'BTW 9%; '),
    ('Heineken twist-off', 'drank', '25.84', '24 stuks', 'Bidfood', NULL, 'BTW 21%; '),
    ('Rijst', 'food', '10.44', '4500 g', 'Bidfood', NULL, 'BTW 9%; '),
    ('Polenghi Lemon Juice', 'food', '2.98', '1000 g', 'Bidfood', 'Lemon juice', 'BTW 9%; '),
    ('Pomegranate molassis', 'food', '4.95', '720 g', 'YecStore', 'Pomegranate seeds', 'BTW 9%; '),
    ('Belvoir mint lime', 'drank', '6.35', '500 stuks', '', NULL, 'BTW 9%; '),
    ('Sesamzaad', 'food', '5.95', '1000 g', 'Van Gelder', NULL, 'BTW 9%; '),
    ('Dadels zonder pit', 'food', '24.5', '5000 g', 'Van Gelder', NULL, 'BTW 9%; '),
    ('AH Reep puur', 'food', '1.8', '100 g', 'AH', 'Aubergine puree, Garlic puree', 'BTW 9%; '),
    ('Bladpeterselie gesneden 3mm zak 500gr stuk', 'food', 11.5, '500 g', 'Van Gelder', 'Parsley', 'Niet geimporteerd: zou botsen met Parsley (flat leaf) als Parsley-prijs bij Van Gelder — ander product?')
ON CONFLICT (excel_name) DO NOTHING;

-- Prijsimport per locatie (naam-match lower/btrim, conform migratiepatroon 028/199)
DO $$
DECLARE
  loc RECORD;
  rec RECORD;
  rid UUID;
  sid UUID;
  inserted INT := 0;
  skipped INT := 0;
BEGIN
  FOR loc IN SELECT id, name FROM locations LOOP
    FOR rec IN
      SELECT * FROM (VALUES
    ('Baking powder', 1000, '1000 g', 1105, 'Bidfood', 'was VHC, nu Bidfood'),
    ('Baking soda', 454, '454 g', 168, 'Bidfood', 'was VHC, nu Bidfood'),
    ('Cutlery', 1000, '1000 stuks', 21790, 'GéDé', 'Excel-naam: Bestekset'),
    ('Black pepper', 1000, '1000 g', 1875, 'Tuana', NULL),
    ('Sugar brown', 600, '600 g', 143, 'Bidfood', 'Excel-naam: Brown sugar; was VHC, nu Bidfood'),
    ('Bulgur', 1000, '1000 g', 286, 'Bidfood', 'was VHC, nu Bidfood'),
    ('Red cabbage shredded', 1000, '1000 g', 275, 'Van Gelder', 'Excel-naam: Cabbage red (3mm)'),
    ('Cardamom', 1000, '1000 g', 2980, 'Tuana', 'Excel-naam: Cardamom (ground); Checken'),
    ('Cauliflower', 10000, '10000 g', 2813, 'Bidfood', 'Excel-naam: Cauliflower (fresh); was VHC, nu Bidfood'),
    ('Charlie''s Orange', 12, '12 stuks', 660, NULL, 'Excel-naam: Charlies; leverancier (geen match in app): Lords'),
    ('Chicken', 10000, '10000 g', 6750, 'Bidfood', 'Excel-naam: Chicken thighs; was VHC, nu Bidfood'),
    ('Chicken', 1000, '1000 g', 1430, NULL, 'Excel-naam: Chicken thighs BIO; leverancier (geen match in app): Pieter van Meel'),
    ('Chili powder', 1000, '1000 g', 1225, 'Tuana', 'Excel-naam: Chili ground'),
    ('Coca Cola', 24, '24 stuks', 1880, 'Bidfood', 'Excel-naam: Coca-cola; was VHC, nu Bidfood'),
    ('Cacao powder', 25000, '25000 g', 16995, NULL, 'Excel-naam: Cocoa powder; leverancier (geen match in app): Notenshop'),
    ('Coriander (fresh)', 1000, '1000 g', 1295, 'Van Gelder', 'checken'),
    ('Coriander (ground)', 1000, '1000 g', 975, 'Tuana', 'Excel-naam: Coriander ground'),
    ('Cucumber', 5400, '5400 g', 1250, 'Van Gelder', NULL),
    ('Cumin', 1000, '1000 g', 2199, 'Tuana', NULL),
    ('Dried dill', 500, '500 g', 1190, 'Tuana', 'Excel-naam: Dill'),
    ('Chickpeas', 10000, '10000 g', 2595, 'Van Gelder', 'Excel-naam: Dried chickpeas'),
    ('Eggs', 5400, '5400 g', 1795, 'Van Gelder', 'Excel-naam: Egg'),
    ('Aubergine', 7700, '7700 g', 1595, 'Van Gelder', 'Excel-naam: Eggplant'),
    ('Flaxseed broken', 1000, '1000 g', 529, 'Bidfood', 'Excel-naam: Flax seed; was VHC, nu Bidfood; Te duur'),
    ('All purpose flour', 10000, '10000 g', 942, 'Bidfood', 'Excel-naam: Flour; was VHC, nu Bidfood; Checken'),
    ('Greek yoghurt 10%', 1000, '1000 g', 287, 'Bidfood', 'Excel-naam: Greek yoghurt; was VHC, nu Bidfood; Duur'),
    ('Green lentils', 10000, '10000 g', 2800, NULL, 'Sourcen'),
    ('Aubergine puree', 650, '650 g', 200, NULL, 'Excel-naam: Grilled Eggplant; Sourcen'),
    ('Stock', 1000, '1000 g', 2743, 'Bidfood', 'Excel-naam: Groentebouillon; was VHC, nu Bidfood'),
    ('Green chili', 500, '500 g', 395, 'Van Gelder', 'Excel-naam: Jalapeno'),
    ('Turmeric', 1000, '1000 g', 775, 'Tuana', 'Excel-naam: Kurkuma'),
    ('Lemon juice', 1000, '1000 g', 814, 'Van Gelder', NULL),
    ('Mango', 10000, '10000 g', 6908, 'Bidfood', 'was VHC, nu Bidfood'),
    ('Mint', 80, '80 g', 159, 'Van Gelder', NULL),
    ('Mustard powder', 1000, '1000 g', 990, 'Tuana', NULL),
    ('Napkins', 1000, '1000 stuks', 2040, 'GéDé', NULL),
    ('Olive oil', 5000, '5000 g', 1995, 'Van Gelder', NULL),
    ('Red onion sliced fine', 1000, '1000 g', 279, 'Van Gelder', 'Excel-naam: Onion (red / rings)'),
    ('Onion peeled', 1000, '1000 g', 235, 'Van Gelder', 'Excel-naam: Onion white (peeled)'),
    ('Parsley', 4000, '4000 g', 1995, 'Van Gelder', 'Excel-naam: Parsley (flat leaf)'),
    ('Pita bread 15 cm', 5000, '5000 g', 3436, 'Bidfood', 'Excel-naam: Pita (100gr); was VHC, nu Bidfood'),
    ('Pomegranate seeds', 1000, '1000 g', 2084, 'Van Gelder', 'Sourcen'),
    ('Rice flour', 25000, '25000 g', 5500, 'Bidfood', 'was VHC, nu Bidfood; Sourcen'),
    ('Red lentils', 500, '500 g', 179, 'Van Gelder', 'Excel-naam: Rode Linzen'),
    ('Romaine lettuce', 5000, '5000 g', 1350, 'Van Gelder', 'Excel-naam: Romaine lettuce (10mm); Wegen'),
    ('Rose petals', 500, '500 g', 1790, 'Tuana', NULL),
    ('Salt', 25000, '25000 g', 2064, 'Bidfood', 'was VHC, nu Bidfood; Checken'),
    ('Sauce cup', 1000, '1000 stuks', 1789, 'GéDé', 'Excel-naam: Sauscup'),
    ('Celery brunoise', 1000, '1000 g', 495, 'Van Gelder', 'Excel-naam: Selderij'),
    ('Soup container', 500, '500 stuks', 4400, 'GéDé', 'Excel-naam: Soep container 450ml'),
    ('Soup lids', 500, '500 stuks', 4950, 'GéDé', 'Excel-naam: Soep deksel 450ml'),
    ('Sugar white', 10000, '10000 g', 2464, 'Bidfood', 'Excel-naam: Sugar (white); was VHC, nu Bidfood'),
    ('Sumac', 1000, '1000 g', 1245, 'Tuana', NULL),
    ('Sunflower oil', 20000, '20000 g', 3650, 'Bidfood', 'was VHC, nu Bidfood'),
    ('Tahini', 18000, '18000 g', 8090, 'Today Food Group', NULL),
    ('Tomato', 6000, '6000 g', 2995, 'Van Gelder', NULL),
    ('Tomato puree', 800, '800 g', 374, 'Bidfood', 'Excel-naam: Tomato paste; was VHC, nu Bidfood'),
    ('Vanilla extract', 1000, '1000 g', 2869, NULL, 'leverancier (geen match in app): Baktotaal; Goedkoper zoeken'),
    ('MSG (Ve Tsin)', 2000, '2000 g', 3828, 'Bidfood', 'Excel-naam: Ve Tsin; was VHC, nu Bidfood'),
    ('Vinegar', 10000, '10000 g', 814, 'Bidfood', 'Excel-naam: Vinegar (white); was VHC, nu Bidfood'),
    ('Xantana', 600, '600 g', 3942, 'Bidfood', 'was VHC, nu Bidfood'),
    ('Za''atar', 1000, '1000 g', 1490, 'Tuana', NULL)
      ) AS t(db_name, pack_size, pack_label, price_cents, supplier_name, note)
    LOOP
      SELECT id INTO rid FROM raw_ingredients
      WHERE location_id = loc.id
        AND lower(btrim(name)) = lower(btrim(rec.db_name))
      ORDER BY created_at LIMIT 1;
      IF rid IS NULL THEN
        skipped := skipped + 1;
        CONTINUE;
      END IF;
      sid := NULL;
      IF rec.supplier_name IS NOT NULL THEN
        SELECT id INTO sid FROM suppliers
        WHERE location_id = loc.id
          AND lower(btrim(name)) = lower(btrim(rec.supplier_name))
        ORDER BY created_at LIMIT 1;
      END IF;
      IF EXISTS (SELECT 1 FROM ingredient_prices
                 WHERE raw_ingredient_id = rid AND source = 'excel_kostprijs_251126'
                   AND supplier_id IS NOT DISTINCT FROM sid) THEN
        CONTINUE;  -- al geimporteerd (idempotent)
      END IF;
      INSERT INTO ingredient_prices
        (raw_ingredient_id, supplier_id, pack_size_grams, pack_size_label,
         price_cents, price_includes_vat, effective_date, source, notes, created_by)
      VALUES
        (rid, sid, rec.pack_size, rec.pack_label,
         rec.price_cents, false, DATE '2025-11-26', 'excel_kostprijs_251126', rec.note, 'kostprijs-import fase 2');
      inserted := inserted + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'kostprijs-import: % prijsregels toegevoegd, % artikelen niet gevonden (zie kostprijs_import_review)', inserted, skipped;
END $$;

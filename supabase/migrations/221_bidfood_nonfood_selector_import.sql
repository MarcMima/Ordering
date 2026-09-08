-- Marc, 8 sept 2026: Bidfood non-food (relevante selectie uit het weekbestand van 30-08-2026)
-- plus Barzini-koffie als nieuwe ingrediënten op alle locaties, zodat ze via de Add item-selector
-- besteld kunnen worden. Wekelijkse telling (maandag) zoals de bestaande non-food. Prijzen komen
-- uit hetzelfde bestand; de wekelijkse Bidfood-sync houdt ze daarna bij.
-- Idempotent: bestaande naam+locatie wordt overgeslagen.
-- Bijgewerkt 08-09 (later op de dag): teruggebracht tot Marcs lijst — wc-papier, centerfeed,
-- besteksetjes, foliedispenser, rietjes, handzeep, sponzen, vaatwaszout, Topmatic, bleek,
-- schoonmaakazijn, afwasmiddel, Rational-tabs, koffie. De 21 overige regels zijn op productie
-- weer verwijderd (zie 223).
-- Deel 2 (onderaan): vijf bestaande GéDé-items verhuizen naar Bidfood omdat Bidfood daar
-- goedkoper is (Marc, 8 sept): wc-papier, besteksetjes, centerfeed, roerstaafjes, foliedispenser.

DO $$
DECLARE
  loc RECORD; sup_id UUID; rid UUID; it RECORD;
BEGIN
  FOR it IN SELECT * FROM (VALUES
    ('Paper straws black (box 250)','106283','non_food','pcs','box',250,'pcs',250,'pcs','box (250 pcs)',1430,487,316,'Doosje 250ST (0.32 kg)','DJ','08710803037272','DRINKR PAPIER ZWART'),
    ('Washing-up liquid 5 L','042902','non_food','ml','can',5,'l',5,'l','can (5 l)',1600,578,5155,'Can 5LT (5.16 kg)','CN','08710803025910','AFWASMIDDEL'),
    ('Dishwasher salt Broxo 10 kg','777920','non_food','g','bag',10,'kg',10,'kg','bag (10 kg)',1610,591,10000,'Zak 10KG (10.00 kg)','ZK','08715800100479','ONTHARDINGSZOUT'),
    ('Topmatic Hero dishwasher detergent 12 kg','752480','non_food','g','can',12,'kg',12,'kg','can (12 kg)',1620,10066,12000,'Can 12KG (12.00 kg)','CN','04028159013968','TOPMATIC HERO VAATWA'),
    ('Topmatic Hero dishwasher detergent 25 kg','752670','non_food','g','can',25,'kg',25,'kg','can (25 kg)',1630,18128,25000,'Can 25KG (25.00 kg)','CN','04028159013975','TOPMATIC HERO VAATWA'),
    ('Bleach 1 L','153238','non_food','ml','bottle',1,'l',1,'l','bottle (1 l)',1650,136,1080,'Fles 1LT (1.08 kg)','FL','08719324686150','DIKBLEEK'),
    ('Cleaning vinegar 5 L','145614','non_food','ml','can',5,'l',5,'l','can (5 l)',1660,325,5040,'Can 5LT (5.04 kg)','CN','08720500110826','SCHOONMAAKAZIJN'),
    ('Rational Active Green cleaner tabs (150)','132051','non_food','pcs','bucket',150,'pcs',150,'pcs','bucket (150 tabs)',1670,10014,5000,'Emmer 150ST (5.00 kg)','EM','04040337565359','ACTIVE GREEN REINING'),
    ('Rational Care Control tabs (150)','027663','non_food','pcs','bucket',150,'pcs',150,'pcs','bucket (150 tabs)',1680,9086,6000,'Emmer 150ST (6.00 kg)','EM','04040337565625','CARE CONTROL TABLET'),
    ('Scouring sponges with grip (pack 10)','159034','non_food','pcs','pack',10,'pcs',10,'pcs','pack (10 pcs)',1690,318,169,'Pak 10ST (0.17 kg)','PK','08710803051179','SCHUURSPONS HANDGR.'),
    ('Steel scourers 40 g (pack 10)','112444','non_food','pcs','pack',10,'pcs',10,'pcs','pack (10 pcs)',1700,806,400,'Zak 10X40GR (0.40 kg)','ZK','08710803036879','PANSPONS RVS'),
    ('Coffee capsules Barzini lungo (box 80)','088391','food','pcs','box',80,'pcs',80,'pcs','box (80 capsules)',1050,8404,2400,'Doos 80X5GR (2.40 kg)','DS','08711363390814','ESPRESSO KOF. LUNGO')
  ) AS v(name, code, kind, unit, count_label, content_amount, content_unit, pack_size, pack_unit, pack_label, dord, price_cents, pack_grams, price_label, ve, ean, article_name)
  LOOP
    FOR loc IN SELECT id FROM locations LOOP
      SELECT id INTO sup_id FROM suppliers WHERE location_id = loc.id AND name = 'Bidfood' LIMIT 1;
      IF sup_id IS NULL THEN CONTINUE; END IF;
      SELECT id INTO rid FROM raw_ingredients WHERE location_id = loc.id AND name = it.name LIMIT 1;
      IF rid IS NULL THEN
        INSERT INTO raw_ingredients (location_id, name, unit, item_kind, stocktake_visible, stocktake_day_of_week, order_interval_days,
          stocktake_unit_label, stocktake_content_amount, stocktake_content_unit, stocktake_display_order)
        VALUES (loc.id, it.name, it.unit, it.kind, true, 1, 7, it.count_label, it.content_amount, it.content_unit, it.dord)
        RETURNING id INTO rid;
        INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
        VALUES (rid, it.pack_size, it.pack_unit, 'both', it.pack_label);
      END IF;
      INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, supplier_article_code, supplier_article_name, order_unit, ean_code, is_preferred, bf_is_active, bf_last_status, bf_last_checked_at)
      VALUES (sup_id, rid, it.code, it.article_name, it.ve, it.ean, true, true, 'Normaal leverbaar', now())
      ON CONFLICT (supplier_id, raw_ingredient_id) DO NOTHING;
      IF NOT EXISTS (SELECT 1 FROM ingredient_prices WHERE raw_ingredient_id = rid AND supplier_id = sup_id) THEN
        INSERT INTO ingredient_prices (raw_ingredient_id, supplier_id, pack_size_grams, pack_size_label, price_cents, price_includes_vat, effective_date, source, created_by)
        VALUES (rid, sup_id, it.pack_grams, it.price_label, it.price_cents, false, DATE '2026-08-30', 'bidfood_type03_20260830', 'migration_221');
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Handzeep stond verborgen; Marc wil hem in de selector.
UPDATE raw_ingredients SET stocktake_visible = true WHERE name = 'Hand soap';
-- Airlaid-servetten (Bidfood 153946) waren als food geclassificeerd.
UPDATE raw_ingredients SET item_kind = 'non_food' WHERE name = 'Napkins Airlaid white 40x40 (pack 60)';

-- ── Deel 2: bestaande items van GéDé naar Bidfood (Bidfood goedkoper) ────────────
DO $$
DECLARE
  loc RECORD; sup_bf UUID; rid UUID; it RECORD;
BEGIN
  FOR it IN SELECT * FROM (VALUES
    ('Toiletpaper',             '135515','ZK','08710803144819','TOIL.PAP REC.TISS.2L', 1365, 3210, 'Zak 12X4RL (3.21 kg)',   48,  'bag (48 rolls)'),
    ('Cutlery',                 '123881','DS','08710803043082','BESTEKSET HOUT 16CM',  2793, 2720, 'Doos 250ST (2.72 kg)',   250, 'box (250 sets)'),
    ('Centerfeed paper roll',   '135643','PK','08710803044782','MIDI POETSPAPIER 1LG', 1690, 6800, 'Pak 6RL (6.80 kg)',      6,   'pack (6 rolls)'),
    ('Stirrer',                 '123819','DJ','08710803042887','ROERSTAAFJE 140MM',    376,  780,  'Doosje 1000ST (0.78 kg)',1000,'box (1000 pcs)'),
    ('Aluminium foil dispenser','071815','DS','04002911196809','FOLIE DISPENSER MET',  1600, 718,  'Doos 1ST (0.72 kg)',     1,   'piece')
  ) AS v(name, code, ve, ean, article_name, price_cents, pack_grams, price_label, order_pack, order_label)
  LOOP
    FOR loc IN SELECT id FROM locations LOOP
      SELECT id INTO sup_bf FROM suppliers WHERE location_id = loc.id AND name = 'Bidfood' LIMIT 1;
      SELECT id INTO rid FROM raw_ingredients WHERE location_id = loc.id AND name = it.name LIMIT 1;
      IF sup_bf IS NULL OR rid IS NULL THEN CONTINUE; END IF;

      -- GéDé-koppeling weg (andere colli-grootte; laten staan is een valkuil bij bestellen)
      DELETE FROM supplier_ingredients si USING suppliers s
      WHERE si.supplier_id = s.id AND si.raw_ingredient_id = rid
        AND lower(translate(s.name, 'éÉ', 'ee')) = 'gede';

      INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, supplier_article_code, supplier_article_name, order_unit, ean_code, is_preferred, bf_is_active, bf_last_status, bf_last_checked_at)
      VALUES (sup_bf, rid, it.code, it.article_name, it.ve, it.ean, true, true, 'Normaal leverbaar', now())
      ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
        SET supplier_article_code = EXCLUDED.supplier_article_code, supplier_article_name = EXCLUDED.supplier_article_name,
            order_unit = EXCLUDED.order_unit, ean_code = EXCLUDED.ean_code, is_preferred = true, bf_is_active = true;

      -- Bestelcolli op de Bidfood-verkoopeenheid zetten; de telling (stocktake-pack) blijft zoals hij was.
      UPDATE ingredient_pack_sizes SET size = it.order_pack, size_unit = 'pcs', display_unit_label = it.order_label
      WHERE raw_ingredient_id = rid AND pack_purpose IN ('order', 'both');

      IF NOT EXISTS (SELECT 1 FROM ingredient_prices WHERE raw_ingredient_id = rid AND supplier_id = sup_bf) THEN
        INSERT INTO ingredient_prices (raw_ingredient_id, supplier_id, pack_size_grams, pack_size_label, price_cents, price_includes_vat, effective_date, source, created_by)
        VALUES (rid, sup_bf, it.pack_grams, it.price_label, it.price_cents, false, DATE '2026-08-30', 'bidfood_type03_20260830', 'migration_221');
      END IF;
    END LOOP;
  END LOOP;
END $$;

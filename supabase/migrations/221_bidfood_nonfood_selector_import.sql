-- Marc, 8 sept 2026: Bidfood non-food (relevante selectie uit het weekbestand van 30-08-2026)
-- plus Barzini-koffie als nieuwe ingrediënten op alle locaties, zodat ze via de Add item-selector
-- besteld kunnen worden. Wekelijkse telling (maandag) zoals de bestaande non-food. Prijzen komen
-- uit hetzelfde bestand; de wekelijkse Bidfood-sync houdt ze daarna bij.
-- Idempotent: bestaande naam+locatie wordt overgeslagen.
-- Deel 2 (onderaan): vijf bestaande GéDé-items verhuizen naar Bidfood omdat Bidfood daar
-- goedkoper is (Marc, 8 sept): wc-papier, besteksetjes, centerfeed, roerstaafjes, foliedispenser.

DO $$
DECLARE
  loc RECORD; sup_id UUID; rid UUID; it RECORD;
BEGIN
  FOR it IN SELECT * FROM (VALUES
    ('Paper straws black (box 250)','106283','non_food','pcs','box',250,'pcs',250,'pcs','box (250 pcs)',1430,487,316,'Doosje 250ST (0.32 kg)','DJ','08710803037272','DRINKR PAPIER ZWART'),
    ('Aluminium catering tray 55 cm (pack 10)','147727','non_food','pcs','pack',10,'pcs',10,'pcs','pack (10 pcs)',1460,1102,720,'Pak 10ST (0.72 kg)','PK','08710803047349','ALU. CAT.SCHAAL 55CM'),
    ('Detectable plasters (box 100)','056876','non_food','pcs','box',100,'pcs',100,'pcs','box (100 pcs)',1470,783,113,'Doosje 100ST (0.11 kg)','DJ','08715886013724','DETEC. PLEISTERS'),
    ('Vacuum bags 30x40 (pack 100)','100402','non_food','pcs','pack',100,'pcs',100,'pcs','pack (100 pcs)',1480,1614,1620,'Zak 100ST (1.62 kg)','ZK','08710803033038','VACUUMZAK 30X40 70MY'),
    ('Garbage bags 60x80 (roll 20)','054424','non_food','pcs','roll',20,'pcs',20,'pcs','roll (20 pcs)',1490,213,580,'Rol 20ST (0.58 kg)','RL','08710803026917','AFVALZ NONKOMO 60X80'),
    ('Piping bags blue 51 cm (box 72)','147538','non_food','pcs','box',72,'pcs',72,'pcs','box (72 pcs)',1500,1313,720,'Doosje 72ST (0.72 kg)','DJ','08710803046526','SPUITZAK BLAUW 51CM'),
    ('Squeeze bottle 70 cl','117937','non_food','pcs','piece',1,'pcs',1,'pcs','piece',1510,185,54,'Fles 1ST (0.05 kg)','FL','08710803039931','KNIJPFL.M.D.70CL TR'),
    ('Thermal till roll 57x30 (box 10)','143292','non_food','pcs','box',10,'pcs',10,'pcs','box (10 rolls)',1520,425,142,'Krimp 10RL (0.14 kg)','KI','08710803043723','THERMOROL 57X30X8'),
    ('Tea towels blue (pack 6)','128321','non_food','pcs','pack',6,'pcs',6,'pcs','pack (6 pcs)',1530,934,654,'Pak 6ST (0.65 kg)','PK','08710803043136','THEEDOEK BL.BLOK 65'),
    ('Washing-up liquid 5 L','042902','non_food','ml','can',5,'l',5,'l','can (5 l)',1600,578,5155,'Can 5LT (5.16 kg)','CN','08710803025910','AFWASMIDDEL'),
    ('Dishwasher salt Broxo 10 kg','777920','non_food','g','bag',10,'kg',10,'kg','bag (10 kg)',1610,591,10000,'Zak 10KG (10.00 kg)','ZK','08715800100479','ONTHARDINGSZOUT'),
    ('Topmatic Hero dishwasher detergent 12 kg','752480','non_food','g','can',12,'kg',12,'kg','can (12 kg)',1620,10066,12000,'Can 12KG (12.00 kg)','CN','04028159013968','TOPMATIC HERO VAATWA'),
    ('Topmatic Hero dishwasher detergent 25 kg','752670','non_food','g','can',25,'kg',25,'kg','can (25 kg)',1630,18128,25000,'Can 25KG (25.00 kg)','CN','04028159013975','TOPMATIC HERO VAATWA'),
    ('Clear Dry Classic rinse aid 5 L','752370','non_food','ml','can',5,'l',5,'l','can (5 l)',1640,11305,5200,'Can 5LT (5.20 kg)','CN','04028159013678','CLEAR DRY CLASSIC NA'),
    ('Bleach 1 L','153238','non_food','ml','bottle',1,'l',1,'l','bottle (1 l)',1650,136,1080,'Fles 1LT (1.08 kg)','FL','08719324686150','DIKBLEEK'),
    ('Cleaning vinegar 5 L','145614','non_food','ml','can',5,'l',5,'l','can (5 l)',1660,325,5040,'Can 5LT (5.04 kg)','CN','08720500110826','SCHOONMAAKAZIJN'),
    ('Rational Active Green cleaner tabs (150)','132051','non_food','pcs','bucket',150,'pcs',150,'pcs','bucket (150 tabs)',1670,10014,5000,'Emmer 150ST (5.00 kg)','EM','04040337565359','ACTIVE GREEN REINING'),
    ('Rational Care Control tabs (150)','027663','non_food','pcs','bucket',150,'pcs',150,'pcs','bucket (150 tabs)',1680,9086,6000,'Emmer 150ST (6.00 kg)','EM','04040337565625','CARE CONTROL TABLET'),
    ('Scouring sponges with grip (pack 10)','159034','non_food','pcs','pack',10,'pcs',10,'pcs','pack (10 pcs)',1690,318,169,'Pak 10ST (0.17 kg)','PK','08710803051179','SCHUURSPONS HANDGR.'),
    ('Steel scourers 40 g (pack 10)','112444','non_food','pcs','pack',10,'pcs',10,'pcs','pack (10 pcs)',1700,806,400,'Zak 10X40GR (0.40 kg)','ZK','08710803036879','PANSPONS RVS'),
    ('Work cloths yellow 38x38 (box 50)','159029','non_food','pcs','box',50,'pcs',50,'pcs','box (50 pcs)',1710,1731,1015,'Doos 50ST (1.01 kg)','DS','08710803051094','WERKDOEK GEEL 38X38'),
    ('Work cloths blue 38x38 (box 50)','159030','non_food','pcs','box',50,'pcs',50,'pcs','box (50 pcs)',1720,1731,1015,'Doos 50ST (1.01 kg)','DS','08710803051100','WERKDOEK BLAUW 38X38'),
    ('Kitchen cleaner / degreaser 5 L','042904','non_food','ml','can',5,'l',5,'l','can (5 l)',1730,1271,5160,'Can 5LT (5.16 kg)','CN','08710803025842','KEUKENREINIGER'),
    ('Degreaser spray 750 ml','059169','non_food','ml','bottle',750,'ml',750,'ml','bottle (750 ml)',1740,280,750,'Fles 750ML (0.75 kg)','FL','08710803026948','ONTVETTER SPRAY'),
    ('Sanitary cleaner 1 L','042911','non_food','ml','bottle',1,'l',1,'l','bottle (1 l)',1750,256,1014,'Fles 1LT (1.01 kg)','FL','08710803025811','SANITAIRREINIGER'),
    ('Glass cleaner Glassex (2 x 750 ml)','135029','non_food','pcs','pack',2,'pcs',2,'pcs','pack (2 bottles)',1760,549,1500,'Wikkel 2X750ML (1.50 kg)','WL','08710552581354','GLAS & MULTI - MULTI'),
    ('Floor cleaner 5 L','042903','non_food','ml','can',5,'l',5,'l','can (5 l)',1770,1106,5060,'Can 5LT (5.06 kg)','CN','08710803025859','VLOERREINIGER'),
    ('Oven & grill cleaner 5 L','059165','non_food','ml','can',5,'l',5,'l','can (5 l)',1780,1353,5000,'Can 5LT (5.00 kg)','CN','08710803028331','OVEN GRILLREINIGER'),
    ('Limescale spray Antikal 800 ml','163473','non_food','ml','bottle',800,'ml',800,'ml','bottle (800 ml)',1790,486,810,'Fles 800ML (0.81 kg)','FL','08700216836197','SPRAY KALKREINIGER'),
    ('Drain unblocker gel 1 L','144755','non_food','ml','bottle',1,'l',1,'l','bottle (1 l)',1800,572,1000,'Fles 1LT (1.00 kg)','FL','07615400841615','ONTSTOPPER GEL'),
    ('Cif cream scouring 2 L','058072','non_food','ml','bottle',2,'l',2,'l','bottle (2 l)',1810,1340,2400,'Flacon 2LT (2.40 kg)','FN','07615400175253','SCHUURMID.PROF CREAM'),
    ('Washing powder 8 kg','091895','non_food','g','pack',8,'kg',8,'kg','pack (8 kg)',1820,1002,7515,'Pak 8KG (7.51 kg)','PK','08710585756507','WASPOEDER'),
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

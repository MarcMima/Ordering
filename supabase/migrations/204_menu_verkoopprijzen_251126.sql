-- 204: Verkoopprijzen uit Excel-kostprijsmodel (Cost analysis, nov 2025)
-- menu_items.price_cents = instore prijs INCL. BTW; alleen vullen waar NULL
-- (199-patroon: handmatig gezette prijzen blijven staan).
-- Online prijzen (incl. BTW) naar menu_item_channel_prices, ON CONFLICT DO NOTHING.
-- Bowls: in Excel hebben alle drie de bases per proteine dezelfde prijs,
-- dus 1 prijs per Bowl-item klopt.

DO $$
DECLARE rec RECORD; mi UUID;
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('Pita Falafel', 1050, 1250),
    ('Pita Cauliflower', 1050, 1250),
    ('Pita Sabich', 1050, 1250),
    ('Pita Chicken', 1150, 1350),
    ('Flatbread Falafel', 1050, 1250),
    ('Flatbread Cauliflower', 1050, 1250),
    ('Flatbread Sabich', 1050, 1250),
    ('Flatbread Chicken', 1150, 1350),
    ('Bowl Falafel', 1250, 1500),
    ('Bowl Cauliflower', 1250, 1500),
    ('Bowl Sabich', 1250, 1500),
    ('Bowl Chicken', 1350, 1550),
    ('Mezze Falafel', 545, 650),
    ('Mezze Cauliflower', 545, 650),
    ('Mezze Aubergine', 545, 650),
    ('Mezze Grilled chicken', 600, 800),
    ('Mezze Tzatziki', 450, 550),
    ('Mezze Baba ganoush', 450, 550),
    ('Mezze Hummus', 450, 550),
    ('Pickled cabbage', 450, 500),
    ('Pickled onions', 450, 500),
    ('Amba', 150, 200),
    ('Tarator', 150, 200),
    ('Shrug', 150, 200),
    ('Tzatziki', 150, 200),
    ('Pita za''atar', 250, 400),
    ('Flatbread', 200, 200),
    ('Brownie', 345, 450),
    ('Flatbread chips', 275, 600),
    ('Lentil soup', 495, 600)
  ) AS t(name, instore_cents, online_cents)
  LOOP
    SELECT id INTO mi FROM menu_items WHERE lower(btrim(name)) = lower(btrim(rec.name)) LIMIT 1;
    IF mi IS NULL THEN
      RAISE NOTICE 'menu-item niet gevonden: %', rec.name;
      CONTINUE;
    END IF;
    UPDATE menu_items SET price_cents = rec.instore_cents, updated_at = NOW()
    WHERE id = mi AND price_cents IS NULL;
    INSERT INTO menu_item_channel_prices (menu_item_id, channel, price_cents)
    VALUES (mi, 'instore', rec.instore_cents), (mi, 'uber_eats', rec.online_cents), (mi, 'thuisbezorgd', rec.online_cents)
    ON CONFLICT (menu_item_id, channel) DO NOTHING;
  END LOOP;
END $$;

-- Verkochte items uit Excel die nog niet als menu_item bestaan: ter review,
-- bewust NIET aangemaakt (zonder componenten zou food cost misleidend 0 zijn).
INSERT INTO kostprijs_import_review
  (excel_name, categorie, prijs_ex_btw_eur, verpakking, leverancier_excel, kandidaten, opmerking)
VALUES
    ('Coca-Cola (verkoop)', 'menu_item', NULL, NULL, NULL, NULL, '2.75 instore / 3.00 online'),
    ('Marie Stella Maris (verkoop)', 'menu_item', NULL, NULL, NULL, NULL, '2.75 instore / 3.00 online'),
    ('Charlies (verkoop)', 'menu_item', NULL, NULL, NULL, NULL, '2.75 instore / 3.00 online'),
    ('Heineken twist-off (verkoop, BTW 21%)', 'menu_item', NULL, NULL, NULL, NULL, '3.50 instore / 4.00 online'),
    ('Lemonade (verkoop)', 'menu_item', NULL, NULL, NULL, NULL, '3.50 instore / 4.00 online'),
    ('Mezze Moroccan carrots', 'menu_item', NULL, NULL, NULL, NULL, '4.50 instore / 6.50 online'),
    ('Mezze Marinated beets', 'menu_item', NULL, NULL, NULL, NULL, '4.50 instore / 6.50 online'),
    ('Mezze Mediterranean salad (= Israeli salad)', 'menu_item', NULL, NULL, NULL, NULL, 'geen verkoopprijs in Excel')
ON CONFLICT (excel_name) DO NOTHING;

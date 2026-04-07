-- Herstel prep_item_ingredients voor alle producten uit het receptenboek (014), maar dan gekoppeld aan
-- **canonieke masternamen** zoals in 028/031. Migratie 031 verwijdert grondstoffen die niet op de master
-- staan → CASCADE verwijderde oude receptregels ("Chicken thigf", "Sliced veggie", "Water", …).
--
-- Deze migratie voegt voor elke locatie die het prep-product op de kaart heeft opnieuw koppelingen toe.
-- Rijen met alleen Water / hot water enz. worden overgeslagen (niet op master). Rose petals / Dried dill /
-- Xantana: grondstoffen in 052, prep-koppelingen in 053 (na 052).
-- Synoniemen: zie comment per cluster in de VALUES hieronder.
--
-- Idempotent: ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE.

WITH recipe(prep_name, master_raw_name, qty_per_unit) AS (
  VALUES
    -- Mudardara
    ('Mudardara', 'Green lentils', 500::numeric),
    ('Mudardara', 'Cumin', 6.3),
    ('Mudardara', 'Salt', 18),
    ('Mudardara', 'Black pepper', 1.2),
    ('Mudardara', 'Olive oil', 54.6),
    ('Mudardara', 'Bulgur', 500),
    -- Falafel (Falafel spice → Cumin als benadering)
    ('Falafel', 'Garlic peeled', 60),
    ('Falafel', 'Onion peeled', 1000),
    ('Falafel', 'Coriander', 370),
    ('Falafel', 'Parsley', 800),
    ('Falafel', 'Chickpeas', 5700),
    ('Falafel', 'Cumin', 180),
    ('Aubergine / Sabich', 'Aubergine', 3000),
    ('Aubergine / Sabich', 'Salt', 45),
    -- Chicken marinade (Spicemix → Cumin; Water weg)
    ('Chicken marinade', 'Tomato puree', 3200),
    ('Chicken marinade', 'Garlic peeled', 370),
    ('Chicken marinade', 'Lemon juice', 1380),
    ('Chicken marinade', 'Sunflower oil', 1820),
    ('Chicken marinade', 'Cumin', 528),
    ('Chicken marinade', 'MSG (Ve Tsin)', 126),
    -- Marinated chicken (marinadevloeistof → Sunflower oil als proxy voor bestelbare olie)
    ('Marinated chicken', 'Chicken', 10000),
    ('Marinated chicken', 'Sunflower oil', 1200),
    ('Hummus', 'Chickpeas', 4000),
    ('Hummus', 'Lemon juice', 1216),
    ('Hummus', 'Tahini', 1888),
    ('Hummus', 'Salt', 72),
    ('Babe ghanouj', 'Aubergine', 2800),
    ('Babe ghanouj', 'Tahini', 507.4),
    ('Babe ghanouj', 'Lemon juice', 195.7),
    ('Babe ghanouj', 'Salt', 10.5),
    ('Tzatziki', 'Greek yoghurt 10%', 6000),
    ('Tzatziki', 'Cucumber', 2100),
    ('Tzatziki', 'Salt', 36),
    ('Tarator', 'Tahini', 3068),
    ('Tarator', 'Lemon juice', 329.6),
    ('Tarator', 'Salt', 18),
    ('Amba', 'Mango', 3000),
    ('Amba', 'Garlic peeled', 60),
    ('Amba', 'Olive oil', 218.4),
    ('Amba', 'Cumin', 8.4),
    ('Amba', 'Sumac', 4.6),
    ('Amba', 'Chili powder', 10),
    ('Amba', 'Salt', 24),
    ('Amba', 'Mustard powder', 21.1),
    ('Amba', 'Lemon juice', 247.2),
    ('Amba', 'Vinegar', 484.8),
    ('Srug', 'Garlic peeled', 10),
    ('Srug', 'Green chili', 600),
    ('Srug', 'Coriander', 320),
    ('Srug', 'Olive oil', 873.6),
    ('Srug', 'Salt', 6),
    ('Srug', 'Xantana', 0.6),
    ('Srug', 'Cumin', 4.2),
    ('Srug', 'Cardamom', 2.1),
    ('Tahin brownie dough', 'Flaxseed broken', 256),
    ('Tahin brownie dough', 'Tahini', 1000),
    ('Tahin brownie dough', 'Sugar white', 1500),
    ('Tahin brownie dough', 'Sugar brown', 1800),
    ('Tahin brownie dough', 'Vanilla extract', 71.2),
    ('Tahin brownie dough', 'All purpose flour', 1000),
    ('Tahin brownie dough', 'Cacao powder', 70),
    ('Tahin brownie dough', 'Salt', 36),
    ('Tahin brownie dough', 'Baking powder', 24),
    ('Pickling liquid', 'Salt', 180),
    ('Pickling liquid', 'Sugar white', 127.5),
    ('Pickling liquid', 'Vinegar', 7575),
    ('Pickled cabbage', 'Red cabbage shredded', 3000),
    ('Pickled onion', 'Red onion sliced fine', 3000),
    ('Feta', 'Feta cheese', 900),
    ('Lettuce', 'Romaine lettuce', 5000),
    ('Pomegranate', 'Pomegranate seeds', 3920),
    -- Per 1 prep-eenheid (GN 1/3, zie 018); oorspronkelijke sheet was batch-totaal → geschaald naar g per eenheid.
    ('Mediterranean salad / Medi salad', 'Tomato', 1000),
    ('Mediterranean salad / Medi salad', 'Cucumber', 1470),
    ('Mediterranean salad / Medi salad', 'Parsley', 1),
    -- 30 eieren per GN 1/6-eenheid (018); 5400 was gram uit sheet maar raw Eggs = pcs → foutieve schaal.
    ('Boiled eggs', 'Eggs', 30),
    ('Za''atar flatbread chips', 'Flatbread', 210),
    ('Za''atar flatbread chips', 'Za''atar', 18),
    ('Za''atar flatbread chips', 'Salt', 6),
    ('Lebanese lentil soup', 'Olive oil', 40),
    ('Lebanese lentil soup', 'Onion peeled', 200),
    ('Lebanese lentil soup', 'Carrot julienne', 220),
    ('Lebanese lentil soup', 'Celery brunoise', 90),
    ('Lebanese lentil soup', 'Garlic peeled', 12),
    ('Lebanese lentil soup', 'Red lentils', 285),
    ('Lebanese lentil soup', 'Rice basmati', 100),
    ('Lebanese lentil soup', 'Stock', 50),
    ('Lebanese lentil soup', 'Lemon juice', 100),
    ('Lebanese lentil soup', 'Turmeric', 2.5),
    ('Lebanese lentil soup', 'Cumin', 4.2),
    ('Lebanese lentil soup', 'Black pepper', 2.4),
    ('Rose lemonade', 'Sugar white', 175),
    ('Rose lemonade', 'Lemon juice', 65),
    ('Turmeric rice', 'Rice basmati', 1000),
    ('Turmeric rice', 'Turmeric', 15),
    ('Turmeric rice', 'Cumin', 6.3),
    ('Turmeric rice', 'Salt', 18),
    ('Turmeric rice', 'Black pepper', 2.3),
    ('Turmeric rice', 'Sunflower oil', 87.8),
    ('Turmeric rice', 'Stock', 40),
    ('Turmeric rice', 'Parsley', 30)
),
agg AS (
  SELECT prep_name, master_raw_name, SUM(qty_per_unit) AS qty_per_unit
  FROM recipe
  GROUP BY prep_name, master_raw_name
)
INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
SELECT p.id, r.id, agg.qty_per_unit
FROM agg
JOIN prep_items p ON lower(btrim(p.name)) = lower(btrim(agg.prep_name))
JOIN location_prep_items lpi ON lpi.prep_item_id = p.id
JOIN raw_ingredients r
  ON r.location_id = lpi.location_id
 AND lower(btrim(r.name)) = lower(btrim(agg.master_raw_name))
ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    updated_at = NOW();

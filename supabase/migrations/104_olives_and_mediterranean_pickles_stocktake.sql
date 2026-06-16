-- Olijven op stocktake (na Feta): GN 1/6, ~750 g.
-- Mediterranean pickles: GN 1/3 → GN 1/6, ~1000 g.

INSERT INTO prep_items (name, unit, content_amount, content_unit)
SELECT 'Olives', 'GN 1/6', 750, 'g'
WHERE NOT EXISTS (
  SELECT 1 FROM prep_items p WHERE lower(btrim(p.name)) = lower(btrim('Olives'))
);

INSERT INTO location_prep_items (location_id, prep_item_id, base_quantity)
SELECT l.id, p.id, 1
FROM locations l
CROSS JOIN prep_items p
WHERE lower(btrim(p.name)) = lower(btrim('Olives'))
ON CONFLICT (location_id, prep_item_id) DO NOTHING;

UPDATE prep_items
SET
  unit = 'GN 1/6',
  content_amount = 1000,
  content_unit = 'g',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Mediterranean pickles'));

-- Stocktake-volgorde (location_prep_items.display_order), afgestemd op docs/stocktake-order-template.csv
UPDATE location_prep_items lpi
SET display_order = m.ord * 10, updated_at = NOW()
FROM prep_items pi
INNER JOIN (
  VALUES
    ('Feta', 20),
    ('Olives', 21),
    ('Shifka peppers', 22),
    ('Mediterranean pickles', 23),
    ('Mint', 24),
    ('Parsley', 25),
    ('Rose lemonade', 26),
    ('Tahin brownie dough', 27),
    ('Za''atar flatbread chips', 28),
    ('Lebanese lentil soup', 29),
    ('Mudardara', 30),
    ('Turmeric rice', 31),
    ('Chicken marinade', 32),
    ('Pickling liquid', 33)
) AS m(name, ord) ON lower(btrim(pi.name)) = lower(btrim(m.name))
WHERE lpi.prep_item_id = pi.id;

-- Replace finished product "Pickling veggies (red onion or cabbage)" with two items:
-- Pickled cabbage, Pickled onion (same raw recipe line as before: Sliced veggie 3000 g).

INSERT INTO prep_items (name, unit)
SELECT v.name, 'g'
FROM (VALUES ('Pickled cabbage'), ('Pickled onion')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM prep_items p WHERE lower(trim(p.name)) = lower(trim(v.name)));

INSERT INTO location_prep_items (location_id, prep_item_id, base_quantity)
SELECT l.id, p.id, 1
FROM locations l
CROSS JOIN prep_items p
WHERE lower(trim(p.name)) IN ('pickled cabbage', 'pickled onion')
ON CONFLICT (location_id, prep_item_id) DO NOTHING;

-- Link each new prep to "Sliced veggie" at every location (same qty as old bulk recipe).
INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
SELECT p.id, r.id, 3000
FROM prep_items p
CROSS JOIN raw_ingredients r
WHERE lower(trim(p.name)) IN ('pickled cabbage', 'pickled onion')
  AND lower(trim(r.name)) = 'sliced veggie'
ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
  SET quantity_per_unit = EXCLUDED.quantity_per_unit,
      updated_at = NOW();

-- Remove the combined prep item (cascades to old recipe rows and location links).
DELETE FROM prep_items
WHERE lower(trim(name)) = lower(trim('Pickling veggies (red onion or cabbage)'));

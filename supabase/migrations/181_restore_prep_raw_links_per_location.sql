-- Ensure every location that has a prep on the menu gets its own raw recipe links.
-- Cross-location links were blocked by 180; Amsterdam-only rows left Pijp/Zuidas without recipes.

WITH recipe(prep_name, master_raw_name, qty_per_unit) AS (
  VALUES
    ('Pickled onion', 'Red onion sliced fine', 3000::numeric),
    ('Pickled cabbage', 'Red cabbage shredded', 3000),
    ('Aubergine / Sabich', 'Aubergine', 2600),
    ('Baba ganoush', 'Aubergine', 2400),
    ('Falafel', 'Parsley', 800),
    ('Mediterranean salad / Medi salad', 'Parsley', 15),
    ('Turmeric rice', 'Parsley', 30),
    ('Parsley', 'Parsley', 500)
)
INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
SELECT p.id, r.id, recipe.qty_per_unit
FROM recipe
JOIN prep_items p ON lower(btrim(p.name)) = lower(btrim(recipe.prep_name))
JOIN location_prep_items lpi ON lpi.prep_item_id = p.id
JOIN raw_ingredients r
  ON r.location_id = lpi.location_id
 AND lower(btrim(r.name)) = lower(btrim(recipe.master_raw_name))
ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    updated_at = NOW();

-- Parsley ordering was near-zero at Pijp/Zuidas/Test because Falafel/Medi/Turmeric linked to
-- another location's raw_ingredient_id. Re-link per location_prep_items → local Parsley raw.

WITH recipe(prep_name, master_raw_name, qty_per_unit) AS (
  VALUES
    ('Falafel', 'Parsley', 800::numeric),
    ('Mediterranean salad / Medi salad', 'Parsley', 15),
    ('Turmeric rice', 'Parsley', 30),
    ('Parsley', 'Parsley', 500)
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

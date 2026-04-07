-- Koppelt Tzatziki / Srug / Rose lemonade aan Rose petals, Dried dill, Xantana (hoeveelheden uit 014).
-- Moet na 052 (master grondstoffen bestaan). Idempotent met 051 (zelfde ON CONFLICT).

WITH recipe(prep_name, master_raw_name, qty_per_unit) AS (
  VALUES
    ('Tzatziki', 'Dried dill', 45::numeric),
    ('Srug', 'Xantana', 0.6),
    ('Rose lemonade', 'Rose petals', 45)
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

-- Mint prep (finished GN 1/6) → raw Mint for ordering suggestions.

INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
SELECT p.id, r.id, 500::numeric
FROM prep_items p
JOIN location_prep_items lpi ON lpi.prep_item_id = p.id
JOIN raw_ingredients r
  ON r.location_id = lpi.location_id
 AND lower(btrim(r.name)) = lower(btrim('Mint'))
WHERE lower(btrim(p.name)) = lower(btrim('Mint'))
ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
  SET quantity_per_unit = EXCLUDED.quantity_per_unit, updated_at = NOW();

UPDATE raw_ingredients
SET stocktake_visible = TRUE, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Mint'));

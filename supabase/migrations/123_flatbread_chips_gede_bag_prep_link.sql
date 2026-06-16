-- Za'atar flatbread chips: 1 GeDe window bag per finished bag (prep count unit).
-- Recipe uses ~210 g flatbread per bag; menu portion ~87–100 g finished chips per bag.

INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
SELECT p.id, ri.id, 1.0
FROM prep_items p
JOIN location_prep_items lpi ON lpi.prep_item_id = p.id
JOIN raw_ingredients ri
  ON ri.location_id = lpi.location_id
 AND lower(btrim(ri.name)) = lower(btrim('Flatbreadchips bags with window'))
WHERE lower(btrim(p.name)) = lower(btrim('Za''atar flatbread chips'))
ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    updated_at = NOW();

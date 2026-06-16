-- Marinated chicken: oil is already in Chicken marinade — remove duplicate Sunflower oil line.
DELETE FROM prep_item_ingredients pii
USING prep_items pi, raw_ingredients ri
WHERE pii.prep_item_id = pi.id
  AND pii.raw_ingredient_id = ri.id
  AND lower(btrim(pi.name)) = lower(btrim('Marinated chicken'))
  AND lower(btrim(ri.name)) = lower(btrim('Sunflower oil'));

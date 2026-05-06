-- Ordering calibration (2026-04): Lettuce + aubergine suggested quantities read high vs. kitchen reality.
-- prep_item_ingredients.quantity_per_unit is the batch total (with ingredient_qty_is_per_recipe_batch + yield scaling).
-- Slight downward adjustment to batch grams reduces daily raw need and order lines proportionally.

-- Lettuce prep → Romaine lettuce (batch was 5000 g in 051 / 014)
UPDATE prep_item_ingredients AS pii
SET quantity_per_unit = 4200
FROM prep_items AS p, raw_ingredients AS ri
WHERE pii.prep_item_id = p.id
  AND ri.id = pii.raw_ingredient_id
  AND lower(btrim(p.name)) = lower(btrim('Lettuce'))
  AND lower(btrim(ri.name)) = lower(btrim('Romaine lettuce'));

-- Aubergine / Sabich → Aubergine (batch was 3000 g)
UPDATE prep_item_ingredients AS pii
SET quantity_per_unit = 2600
FROM prep_items AS p, raw_ingredients AS ri
WHERE pii.prep_item_id = p.id
  AND ri.id = pii.raw_ingredient_id
  AND lower(btrim(p.name)) = lower(btrim('Aubergine / Sabich'))
  AND lower(btrim(ri.name)) = lower(btrim('Aubergine'));

-- Baba ganoush (name variants) → Aubergine per recipe batch (was 2800 g)
UPDATE prep_item_ingredients AS pii
SET quantity_per_unit = 2400
FROM prep_items AS p, raw_ingredients AS ri
WHERE pii.prep_item_id = p.id
  AND ri.id = pii.raw_ingredient_id
  AND lower(btrim(p.name)) IN ('baba ganoush', 'babe ghanouj')
  AND lower(btrim(ri.name)) = lower(btrim('Aubergine'));

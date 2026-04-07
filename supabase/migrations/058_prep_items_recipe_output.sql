-- Tel-eenheid (content_amount / unit) vs werkelijke recept-output voor bestel-/raw-berekening.
-- Als ingredient_qty_is_per_recipe_batch = true: prep_item_ingredients.quantity_per_unit geldt voor één volledige
-- recept-batch (recipe_output_*); schaal naar telt-eenheid met factor (nominaal g) / (recept-output g).

ALTER TABLE prep_items
  ADD COLUMN IF NOT EXISTS recipe_output_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS recipe_output_unit TEXT,
  ADD COLUMN IF NOT EXISTS ingredient_qty_is_per_recipe_batch BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN prep_items.recipe_output_amount IS 'Werkelijke output van één recept-run (hoeveelheid)';
COMMENT ON COLUMN prep_items.recipe_output_unit IS 'Eenheid: g, kg, ml, l, bottles, pcs, …';
COMMENT ON COLUMN prep_items.ingredient_qty_is_per_recipe_batch IS 'True: quantity_per_unit in prep_item_ingredients is voor de volledige batch (recipe_output); anders per telt-eenheid';

UPDATE prep_items p
SET
  recipe_output_amount = v.amount,
  recipe_output_unit = v.unit,
  ingredient_qty_is_per_recipe_batch = true
FROM (
  VALUES
    ('Chicken marinade', 8.4::numeric, 'kg'),
    ('Hummus', 7.2::numeric, 'kg'),
    ('Babe ghanouj', 3.42::numeric, 'kg'),
    ('Tzatziki', 8::numeric, 'kg'),
    ('Tarator', 8::numeric, 'bottles'),
    ('Amba', 6::numeric, 'bottles'),
    ('Srug', 2.5::numeric, 'bottles'),
    ('Lebanese lentil soup', 3.5::numeric, 'kg'),
    ('Rose lemonade', 10::numeric, 'bottles'),
    ('Mudardara', 2.3::numeric, 'kg'),
    ('Turmeric rice', 2.8::numeric, 'kg')
) AS v(name, amount, unit)
WHERE lower(btrim(p.name)) = lower(btrim(v.name));

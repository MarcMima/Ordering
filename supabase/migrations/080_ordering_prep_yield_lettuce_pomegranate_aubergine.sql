-- Ordering: prep_item_ingredients voor Lettuce / Pomegranate / Aubergine bevatten recept-batchtotalen (051),
-- niet gram per enkele GN-schaal. Zonder recipe_output + ingredient_qty_is_per_recipe_batch wordt dat
-- per telt-eenheid geteld → te hoge dagelijkse raw need (zelfde patroon als 055 Medi salad, 058 Hummus e.d.).
--
-- Aannames (018 content_amount per tel-eenheid):
--   Lettuce: GN 1/2 = 2700 g product; één productiebatch vult 2 GN → output 5400 g.
--   Pomegranate: GN 1/6 = 1000 g; één batch vult 4 GN → output 4000 g (3920 g zaad ≈ batchtotaal).
--   Aubergine / Sabich: GN 1/2 = 2800 g product; één batch = één GN → output 2800 g.

UPDATE prep_items AS p
SET
  recipe_output_amount = v.amount,
  recipe_output_unit = v.unit,
  ingredient_qty_is_per_recipe_batch = true,
  updated_at = NOW()
FROM (
  VALUES
    (lower('Lettuce'), 5400::numeric, 'g'),
    (lower('Pomegranate'), 4000::numeric, 'g'),
    (lower('Aubergine / Sabich'), 2800::numeric, 'g')
) AS v(name_lc, amount, unit)
WHERE lower(btrim(p.name)) = v.name_lc;

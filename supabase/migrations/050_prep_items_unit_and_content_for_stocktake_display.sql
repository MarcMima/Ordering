-- Stocktake toont: unit + (optioneel) "· content_amount content_unit each" (zie stocktake/page.tsx).
-- Producten uit 039/040/044/045 zijn alleen met unit = 'g' gezet, zonder content_* → alleen "g".
-- Waarden hier zijn afgestemd op 018 (GN/mezz/bottle) en ruwe master waar relevant; pas zo nodig aan in Admin → Products.

UPDATE prep_items AS p
SET
  unit = v.u,
  content_amount = v.ca,
  content_unit = v.cu,
  updated_at = NOW()
FROM (VALUES
  -- GN + gewicht (zelfde stijl als hummus / pickled)
  ('Coated Cauliflower', 'GN 1/3', 3000::numeric, 'g'),
  ('Defrosted flatbread', 'Bag', 5::numeric, 'pcs'),
  -- Pita: zelfde orde van grootte als ruwe master (doos ~50 stuks); zo nodig aanpassen
  ('Regular pita with za''atar', 'Box', 50::numeric, 'pcs'),
  ('Wholewheat pita with za''atar', 'Box', 50::numeric, 'pcs'),
  -- 044/045: zelfde schaal als vergelijkbare items in 018
  ('Shifka peppers', 'GN 1/6', 1000::numeric, 'g'),
  ('Mediterranean pickles', 'GN 1/3', 3000::numeric, 'g'),
  ('Mint', 'GN 1/6', 500::numeric, 'g'),
  ('Parsley', 'GN 1/6', 500::numeric, 'g')
) AS v(name, u, ca, cu)
WHERE lower(trim(p.name)) = lower(trim(v.name));

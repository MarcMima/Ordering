-- Bulk insert: ingredient_pack_sizes based on supplier sheet
--
-- This links raw_ingredients to their pack sizes so Stocktake can count in
-- “packs/boxes/bags” while the app stores a base unit (g, ml, pcs).
--
-- GEBRUIK:
-- 1) Check/adjust the sizes below (kg → g, packs, etc. where obvious).
-- 2) Plak dit bestand in Supabase SQL Editor en Run.
-- 3) Het script zoekt raw_ingredients op basis van name (case-insensitive).
--
-- Belangrijk:
-- - size + size_unit beschrijft de verpakking (bijv. 1 kg, 10 kg, 500 g, 30 pcs).
-- - Als er al een pack_size bestaat voor een ingredient met exact dezelfde
--   size + size_unit, gebeurt er niets (ON CONFLICT DO NOTHING).

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
SELECT id, 1, 'kg'
FROM raw_ingredients
WHERE lower(name) = lower('Parsley - whole')
ON CONFLICT DO NOTHING;

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
SELECT id, 1, 'kg'
FROM raw_ingredients
WHERE lower(name) = lower('Koriander')
ON CONFLICT DO NOTHING;

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
SELECT id, 1, 'kg'
FROM raw_ingredients
WHERE lower(name) = lower('Carrot - 1kg')
ON CONFLICT DO NOTHING;

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
SELECT id, 1, 'kg'
FROM raw_ingredients
WHERE lower(name) = lower('Garlic - Puree 1kg')
ON CONFLICT DO NOTHING;

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
SELECT id, 1, 'kg'
FROM raw_ingredients
WHERE lower(name) = lower('Garlic - Peeled 1kg')
ON CONFLICT DO NOTHING;

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
SELECT id, 3, 'kg'
FROM raw_ingredients
WHERE lower(name) = lower('Green chilis - 3kg')
ON CONFLICT DO NOTHING;

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
SELECT id, 1, 'kg'
FROM raw_ingredients
WHERE lower(name) = lower('Red cabbage - shaved')
ON CONFLICT DO NOTHING;

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
SELECT id, 1, 'kg'
FROM raw_ingredients
WHERE lower(name) = lower('Red onion - sliced')
ON CONFLICT DO NOTHING;

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
SELECT id, 1, 'kg'
FROM raw_ingredients
WHERE lower(name) = lower('White onion peeled - 1kg')
ON CONFLICT DO NOTHING;

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
SELECT id, 10, 'kg'
FROM raw_ingredients
WHERE lower(name) = lower('Green lentils (10kg)')
ON CONFLICT DO NOTHING;

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
SELECT id, 10, 'kg'
FROM raw_ingredients
WHERE lower(name) = lower('Chickpeas (10kg)')
ON CONFLICT DO NOTHING;

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
SELECT id, 0.5, 'kg'
FROM raw_ingredients
WHERE lower(name) = lower('Red lentils - 500g')
ON CONFLICT DO NOTHING;

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
SELECT id, 4.5, 'kg'
FROM raw_ingredients
WHERE lower(name) = lower('Pandan rice (soup)')
ON CONFLICT DO NOTHING;

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
SELECT id, 10, 'kg'
FROM raw_ingredients
WHERE lower(name) = lower('Parboiled rice (tumeric rice)')
ON CONFLICT DO NOTHING;

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
SELECT id, 900, 'g'
FROM raw_ingredients
WHERE lower(name) = lower('Feta')
ON CONFLICT DO NOTHING;

-- Voor alle “Units/Box/Bags/Can/etc” waar de precieze inhoud nu nog niet
-- vastligt, kun je later handmatig pack_sizes toevoegen in Supabase:
--   insert into ingredient_pack_sizes (raw_ingredient_id, size, size_unit)
--   values ('<id>', <size>, '<unit>');


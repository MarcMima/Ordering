-- Align met generate_028_master_sync.py: aubergine/sla kg (g) i.p.v. pcs; kip container 5 kg (GN 1/3);
-- flatbread kg als bestel-/telt-eenheid i.p.v. 5 stuks als losse pcs; rozenblaadjes 500 g per zak.
-- Lost pcs-vs-gram receptfouten op (extreme order-suggesties) en toont juiste B/C/D-labels.

-- Aubergine
UPDATE raw_ingredients
SET unit = 'g', stocktake_unit_label = 'box', stocktake_content_amount = 1, stocktake_content_unit = 'kg', updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Aubergine'));
DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id IN (SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Aubergine')));
INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
SELECT id, 1.0, 'kg', 'both', 'box' FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Aubergine'));

-- Romaine lettuce
UPDATE raw_ingredients
SET unit = 'g', stocktake_unit_label = 'box', stocktake_content_amount = 1, stocktake_content_unit = 'kg', updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Romaine lettuce'));
DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id IN (SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Romaine lettuce')));
INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
SELECT id, 1.0, 'kg', 'both', 'box' FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Romaine lettuce'));

-- Chicken (één GN 1/3 ≈ 5 kg gemarineerde kip — zie 018 Marinated chicken)
UPDATE raw_ingredients
SET unit = 'g', stocktake_unit_label = 'container', stocktake_content_amount = 5, stocktake_content_unit = 'kg', updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Chicken'));
DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id IN (SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Chicken')));
INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
SELECT id, 5.0, 'kg', 'both', 'container' FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Chicken'));

-- Flatbread (recept in g; voorraad/bestelling per kg-zak — fysiek 5 stuks in zak blijft operationeel, niet als pcs in DB)
UPDATE raw_ingredients
SET unit = 'g', stocktake_unit_label = 'bag', stocktake_content_amount = 1, stocktake_content_unit = 'kg', updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Flatbread'));
DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id IN (SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Flatbread')));
INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
SELECT id, 1.0, 'kg', 'both', 'bag' FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Flatbread'));

-- Rose petals
UPDATE raw_ingredients
SET unit = 'g', stocktake_unit_label = 'bag', stocktake_content_amount = 0.5, stocktake_content_unit = 'kg', updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Rose petals'));
DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id IN (SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Rose petals')));
INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
SELECT id, 0.5, 'kg', 'both', 'bag' FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Rose petals'));

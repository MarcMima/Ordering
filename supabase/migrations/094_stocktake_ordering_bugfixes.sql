-- User-requested stocktake + ordering fixes (2026-04).

-- 1) Picklin liquid in stocktake: register in 10L jerry cans (base unit stays ml).
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'jerry can',
  stocktake_content_amount = 10,
  stocktake_content_unit = 'l',
  updated_at = NOW()
WHERE lower(btrim(name)) LIKE '%picklin%liquid%';

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) LIKE '%picklin%liquid%'
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 10, 'l', 'both', 'jerry can', 1
FROM raw_ingredients
WHERE lower(btrim(name)) LIKE '%picklin%liquid%';

-- 2) Brownie dough is currently unused: remove from stocktake finished-products list.
DELETE FROM location_prep_items
WHERE prep_item_id IN (
  SELECT id FROM prep_items WHERE lower(btrim(name)) = lower(btrim('Tahin brownie dough'))
);

-- 3) Cucumber: count/order by piece at 350g each (instead of boxes/crates @300g).
UPDATE raw_ingredients
SET updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Cucumber'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Cucumber'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, grams_per_piece, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 1, 'pcs', 350, 'both', 'cucumber', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Cucumber'));

-- 4) Aubergine: stocktake wording + piece-based pack metadata.
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'pieces',
  stocktake_content_amount = 350,
  stocktake_content_unit = 'g',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Aubergine'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Aubergine'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, grams_per_piece, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 1, 'pcs', 350, 'both', 'pieces', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Aubergine'));

-- 5) Ground coriander: hide from stocktake if unused by any prep recipe.
UPDATE raw_ingredients ri
SET
  stocktake_visible = false,
  updated_at = NOW()
WHERE lower(btrim(ri.name)) = lower(btrim('Coriander (ground)'))
  AND NOT EXISTS (
    SELECT 1
    FROM prep_item_ingredients pii
    WHERE pii.raw_ingredient_id = ri.id
  );

-- 6) Flatbread: minimum order quantity = 65 bags.
UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 65
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Flatbread'));

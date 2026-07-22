-- Drinks: ensure Bidfood order packs are trays (colli), not single bottles.
-- Ordering uses stock par (1 tray) because drinks are not in prep recipes.

-- Coca Cola Zero: tray of 24
DELETE FROM ingredient_pack_sizes ips
USING raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Coca Cola Zero'))
  AND ips.pack_purpose IN ('order', 'both');

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 24.0, 'pcs', 'both', 'tray (24-pack)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Coca Cola Zero'));

UPDATE raw_ingredients
SET
  stocktake_unit_label = 'tray',
  stocktake_content_amount = 24,
  stocktake_content_unit = 'pcs',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Coca Cola Zero'));

-- Sparkling water: tray of 18
DELETE FROM ingredient_pack_sizes ips
USING raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Sparkling water'))
  AND ips.pack_purpose IN ('order', 'both');

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 18.0, 'pcs', 'both', 'tray (18 bottles)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Sparkling water'));

UPDATE raw_ingredients
SET
  stocktake_unit_label = 'tray',
  stocktake_content_amount = 18,
  stocktake_content_unit = 'pcs',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Sparkling water'));

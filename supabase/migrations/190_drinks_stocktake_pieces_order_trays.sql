-- Drinks: stocktake in individual bottles (pcs); order in tray colli.
-- Reverses 187/188 (and master tray labels) that made stocktake count trays.

UPDATE raw_ingredients
SET
  stocktake_unit_label = 'piece',
  stocktake_content_amount = 1,
  stocktake_content_unit = 'pcs',
  stocktake_visible = TRUE,
  updated_at = NOW()
WHERE lower(btrim(name)) IN (
  lower(btrim('Coca Cola')),
  lower(btrim('Coca Cola Zero')),
  lower(btrim('Still water')),
  lower(btrim('Sparkling water'))
);

-- Order-only tray packs (stocktake uses master piece fields above).
DELETE FROM ingredient_pack_sizes ips
USING raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) IN (
    lower(btrim('Coca Cola')),
    lower(btrim('Coca Cola Zero')),
    lower(btrim('Still water')),
    lower(btrim('Sparkling water'))
  );

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 24.0, 'pcs', 'order', 'tray (24-pack)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) IN (
  lower(btrim('Coca Cola')),
  lower(btrim('Coca Cola Zero'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 18.0, 'pcs', 'order', 'tray (18 bottles)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) IN (
  lower(btrim('Still water')),
  lower(btrim('Sparkling water'))
);

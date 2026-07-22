-- SOOF drinks: stocktake in individual bottles (pcs); order in tray colli (12-pack).
-- Matches 190_drinks_stocktake_pieces_order_trays for Coca Cola / water.

UPDATE raw_ingredients
SET
  stocktake_unit_label = 'piece',
  stocktake_content_amount = 1,
  stocktake_content_unit = 'pcs',
  updated_at = NOW()
WHERE lower(btrim(name)) IN (
  lower(btrim('SOOF Mint')),
  lower(btrim('SOOF Cardamom'))
);

-- Order-only tray packs (stocktake uses master piece fields above).
DELETE FROM ingredient_pack_sizes ips
USING raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) IN (
    lower(btrim('SOOF Mint')),
    lower(btrim('SOOF Cardamom'))
  );

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 12.0, 'pcs', 'order', 'tray (12-pack)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) IN (
  lower(btrim('SOOF Mint')),
  lower(btrim('SOOF Cardamom'))
);

-- Plastic bottle (rose lemonade) and Flatbreadchips bags: behave like other Gédé packaging
-- (supplier mapping only, no prep_item_ingredients → no automatic order suggestion from prep).

-- 1) Remove prep-recipe links (packaging is ordered manually like foil, napkins, etc.)
DELETE FROM prep_item_ingredients pii
USING raw_ingredients ri
WHERE pii.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) IN (
    lower(btrim('Plastic bottle (rose lemonade)')),
    lower(btrim('Flatbreadchips bags with window'))
  );

-- 2) Flatbread chip bags: order pack = Box of 10 stacks (master sheet), not 500 pcs
UPDATE ingredient_pack_sizes ips
SET
  size = 10,
  size_unit = 'pcs',
  display_unit_label = 'Box',
  updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Flatbreadchips bags with window'))
  AND lower(btrim(COALESCE(ips.pack_purpose, ''))) = 'order';

-- 3) Rose lemonade bottles: stocktake per bottle, order per box (108) — like other Gédé roll/box items
UPDATE raw_ingredients ri
SET
  stocktake_unit_label = 'bottle',
  stocktake_content_amount = 1,
  stocktake_content_unit = 'pcs',
  updated_at = NOW()
WHERE lower(btrim(ri.name)) = lower(btrim('Plastic bottle (rose lemonade)'));

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
SELECT ri.id, 1, 'pcs', 'stocktake', 'bottle'
FROM raw_ingredients ri
WHERE lower(btrim(ri.name)) = lower(btrim('Plastic bottle (rose lemonade)'))
  AND NOT EXISTS (
    SELECT 1
    FROM ingredient_pack_sizes ips
    WHERE ips.raw_ingredient_id = ri.id
      AND lower(btrim(COALESCE(ips.pack_purpose, ''))) = 'stocktake'
  );

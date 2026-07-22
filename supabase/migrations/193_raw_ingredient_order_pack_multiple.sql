-- Add order_pack_multiple to raw_ingredients as a single source of truth for
-- the colli step per ingredient (replaces per-pack-row values).
ALTER TABLE raw_ingredients
  ADD COLUMN IF NOT EXISTS order_pack_multiple INTEGER;

COMMENT ON COLUMN raw_ingredients.order_pack_multiple IS
  'Order in multiples of this many packs (default 1). Single source of truth for colli step.';

-- Seed from existing ingredient_pack_sizes values: for each raw ingredient,
-- pick the order_pack_multiple from the pack with pack_purpose = ''order'' (or ''both''),
-- falling back to the first non-null value.
UPDATE raw_ingredients ri
SET order_pack_multiple = sub.opm
FROM (
  SELECT DISTINCT ON (ips.raw_ingredient_id)
    ips.raw_ingredient_id,
    ips.order_pack_multiple AS opm
  FROM ingredient_pack_sizes ips
  WHERE ips.order_pack_multiple IS NOT NULL
    AND ips.order_pack_multiple > 1
  ORDER BY ips.raw_ingredient_id,
    CASE
      WHEN ips.pack_purpose = 'order' THEN 0
      WHEN ips.pack_purpose = 'both' THEN 1
      ELSE 2
    END,
    ips.id
) sub
WHERE ri.id = sub.raw_ingredient_id;

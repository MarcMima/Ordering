-- How many packs must be ordered at once for a given pack line (supplier constraints).
-- Default 1 = any whole number of packs (e.g. one box of eggs). Use 2 = only even counts (e.g. cacao by the pair).

ALTER TABLE ingredient_pack_sizes
  ADD COLUMN IF NOT EXISTS order_pack_multiple INTEGER NOT NULL DEFAULT 1
  CHECK (order_pack_multiple >= 1);

COMMENT ON COLUMN ingredient_pack_sizes.order_pack_multiple IS
  'Suggest orders in multiples of this many packs (e.g. 2 = pairs of boxes). 1 = whole packs only, no extra rounding.';

-- Example: Cacao powder — supplier ships in pairs of boxes.
UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 2
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Cacao powder'));

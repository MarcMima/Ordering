-- If 027 ran before grams_per_piece was added to that file, apply this once.
-- Safe no-op when column already exists (IF NOT EXISTS).

ALTER TABLE ingredient_pack_sizes
  ADD COLUMN IF NOT EXISTS grams_per_piece NUMERIC NULL;

COMMENT ON COLUMN ingredient_pack_sizes.grams_per_piece IS
  'If size_unit is pcs: grams per piece when raw ingredient unit is g (e.g. one retail pack).';

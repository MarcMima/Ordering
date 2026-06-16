-- Ordering: aubergine in crates (14 pcs), not raw grams.
-- unit stays g (recipes); pack needs grams_per_piece so packSizeToBaseAmount works (350 g × 14 = 4900 g/crate).

UPDATE raw_ingredients
SET
  unit = 'g',
  stocktake_unit_label = 'crate',
  stocktake_content_amount = 14,
  stocktake_content_unit = 'pcs',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Aubergine'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Aubergine'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, grams_per_piece, order_pack_multiple
)
SELECT id, 14.0, 'pcs', 'both', 'crate (14 pcs)', 350.0, 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Aubergine'));

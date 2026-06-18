-- Cucumber: order per wholesale crate (12 pcs), not per piece.

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Cucumber'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, grams_per_piece, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 12, 'pcs', 350, 'both', 'crate (12 pcs)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Cucumber'));

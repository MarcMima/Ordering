-- Cauliflower: order per box (4 bags × 2.5 kg = 10 kg). Stocktake stays per bag via raw master.

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Cauliflower'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 10, 'kg', 'order', 'box (4 × 2.5 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Cauliflower'));

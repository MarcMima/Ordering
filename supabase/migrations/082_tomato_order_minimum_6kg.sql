-- Fresh tomatoes: minimum order / collo = 6 kg (single wholesale box).
-- Aligns stocktake master + order packs so suggestions never split below 6 kg.

UPDATE raw_ingredients
SET
  stocktake_unit_label = 'box',
  stocktake_content_amount = 6,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Tomato'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Tomato'))
);

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple)
SELECT id, 6.0, 'kg', 'both', 'box (6 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Tomato'));

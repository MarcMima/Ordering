-- Flatbread: tellen/bestellen per zak van 5 stuks (recept in g; 5 × 70 g = 350 g per zak).
-- Vervangt 056/034 “bag: 1 kg” (verouderde aanname) door “bag: 5 pcs”.

UPDATE raw_ingredients
SET
  unit = 'g',
  stocktake_unit_label = 'bag',
  stocktake_content_amount = 5,
  stocktake_content_unit = 'pcs',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Flatbread'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Flatbread'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id,
  size,
  size_unit,
  pack_purpose,
  display_unit_label,
  grams_per_piece,
  order_pack_multiple
)
SELECT
  id,
  5.0,
  'pcs',
  'both',
  'bag',
  70.0,
  65
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Flatbread'));

-- Flatbread: 70 g per stuk (5 stuks per zak = 350 g); corrigeert 097 indien die met 200 g was toegepast.

UPDATE ingredient_pack_sizes
SET grams_per_piece = 70.0
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Flatbread'))
)
AND lower(btrim(size_unit)) IN ('pcs', 'piece', 'pieces');

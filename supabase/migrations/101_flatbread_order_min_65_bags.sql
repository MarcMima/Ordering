-- Java Bakery flatbread: minimum bestelhoeveelheid 65 zakken (5 stuks/zak).
-- Verloren na 097 (INSERT zonder order_pack_multiple → default 1).

UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 65
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Flatbread'));

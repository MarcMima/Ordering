-- Still + sparkling water: order in multiples of 18 bottles (Bidfood coli / tray).

UPDATE ingredient_pack_sizes ips
SET
  order_pack_multiple = 18,
  display_unit_label = 'bottle (18-pack)',
  updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) IN (lower(btrim('Still water')), lower(btrim('Sparkling water')))
  AND ips.pack_purpose IN ('order', 'both');

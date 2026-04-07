-- Align Salt stocktake packaging with master: bucket 5 kg (was bag 1 kg).
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'bucket',
  stocktake_content_amount = 5,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(trim(name)) = 'salt';

UPDATE ingredient_pack_sizes ips
SET
  size = 5,
  size_unit = 'kg',
  display_unit_label = 'bucket',
  updated_at = NOW()
FROM raw_ingredients r
WHERE ips.raw_ingredient_id = r.id
  AND lower(trim(r.name)) = 'salt'
  AND (ips.pack_purpose IS NULL OR lower(trim(ips.pack_purpose)) IN ('stocktake', 'both'));

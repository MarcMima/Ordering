-- Restore parsley 4 kg box (VG art. 142088) + 1 kg add-on bag; undo 177 parsley deletion.

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 4.0, 'kg', 'order', 'box (4 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Parsley'))
  AND NOT EXISTS (
    SELECT 1 FROM ingredient_pack_sizes ips
    WHERE ips.raw_ingredient_id = raw_ingredients.id
      AND ips.pack_purpose IN ('order', 'both')
      AND ips.size = 4
      AND ips.size_unit = 'kg'
  );

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 1.0, 'kg', 'order', 'bag (1 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Parsley'))
  AND NOT EXISTS (
    SELECT 1 FROM ingredient_pack_sizes ips
    WHERE ips.raw_ingredient_id = raw_ingredients.id
      AND ips.pack_purpose IN ('order', 'both')
      AND ips.size = 1
      AND ips.size_unit = 'kg'
  );

-- (VG EAN per pack size is resolved in dispatch-order; default supplier link stays 1 kg.)

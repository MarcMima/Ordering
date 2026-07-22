-- Pijp ordering fixes (Jul 2026): re-apply case packs, parsley 1 kg only, cauliflower box.

-- ─── Re-apply case packs (idempotent; fixes stale order_pack_multiple from 157) ─
UPDATE ingredient_pack_sizes ips
SET
  size = 7.2,
  size_unit = 'kg',
  display_unit_label = 'case (12 × 600 g)',
  order_pack_multiple = 1,
  updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Sugar brown'))
  AND ips.pack_purpose IN ('order', 'both');

UPDATE ingredient_pack_sizes ips
SET
  size = 10,
  size_unit = 'kg',
  display_unit_label = 'case (10 × 1 kg)',
  order_pack_multiple = 1,
  updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('All purpose flour'))
  AND ips.pack_purpose IN ('order', 'both');

UPDATE ingredient_pack_sizes ips
SET
  size = 12,
  size_unit = 'l',
  display_unit_label = 'case (12 × 1 L)',
  order_pack_multiple = 1,
  updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Lemon juice'))
  AND ips.pack_purpose IN ('order', 'both');

-- ─── Parsley: Van Gelder only sells 1 kg (KST1KG); drop 4 kg box order pack ─────
DELETE FROM ingredient_pack_sizes ips
USING raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Parsley'))
  AND ips.pack_purpose IN ('order', 'both')
  AND ips.size = 4
  AND ips.size_unit = 'kg';

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 1.0, 'kg', 'order', 'bag (1 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Parsley'))
  AND NOT EXISTS (
    SELECT 1 FROM ingredient_pack_sizes ips2
    WHERE ips2.raw_ingredient_id = raw_ingredients.id
      AND ips2.pack_purpose IN ('order', 'both')
      AND ips2.size = 1
      AND ips2.size_unit = 'kg'
  );

-- ─── Cauliflower: order per box (4 × 2.5 kg), not per bag ───────────────────
DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Cauliflower'))
)
AND pack_purpose IN ('order', 'both')
AND NOT (size = 10 AND size_unit = 'kg');

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 10, 'kg', 'order', 'box (4 × 2.5 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Cauliflower'))
  AND NOT EXISTS (
    SELECT 1 FROM ingredient_pack_sizes ips
    WHERE ips.raw_ingredient_id = raw_ingredients.id
      AND ips.pack_purpose IN ('order', 'both')
      AND ips.size = 10
      AND ips.size_unit = 'kg'
  );

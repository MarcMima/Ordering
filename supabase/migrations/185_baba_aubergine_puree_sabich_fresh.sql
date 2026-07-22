-- Separate fresh aubergine (VG / Sabich) from Bidfood aubergine puree (Baba ganoush).
-- Baba must not drive Van Gelder aubergine crate orders.

-- Drop Baba → fresh Aubergine links
DELETE FROM prep_item_ingredients pii
USING prep_items p, raw_ingredients ri
WHERE pii.prep_item_id = p.id
  AND pii.raw_ingredient_id = ri.id
  AND lower(btrim(p.name)) IN ('baba ganoush', 'babe ghanouj')
  AND lower(btrim(ri.name)) = lower(btrim('Aubergine'));

-- Link Baba → Aubergine puree (per location), ~2400 g puree per batch
INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
SELECT p.id, ri.id, 2400::numeric
FROM prep_items p
JOIN location_prep_items lpi ON lpi.prep_item_id = p.id
JOIN raw_ingredients ri
  ON ri.location_id = lpi.location_id
 AND lower(btrim(ri.name)) = lower(btrim('Aubergine puree'))
WHERE lower(btrim(p.name)) IN ('baba ganoush', 'babe ghanouj')
ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    updated_at = NOW();

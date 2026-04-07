-- Order-suggestie: quantity_per_unit moet dezelfde basis-eenheid gebruiken als raw_ingredients.unit
-- (zie 010). Komkommer stond op pcs terwijl recepten gram gebruikten → astronomische aantallen.
-- Medi salad + eieren: sheet-waarden waren batch-totalen / gram i.p.v. per prep-eenheid (GN).
-- Align met 051 + gegenereerde 028 na Cucumber TSV box 1 kg.

-- Komkommer: weegbasis (g) i.p.v. stuks — zie generate_028_master_sync.py
UPDATE raw_ingredients
SET
  unit = 'g',
  stocktake_unit_label = 'box',
  stocktake_content_amount = 1,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Cucumber'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Cucumber'))
);

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
SELECT id, 1.0, 'kg', 'both', 'box'
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Cucumber'));

-- Mediterranean salad (per GN 1/3-schaal, zie 018 / 051)
UPDATE prep_item_ingredients AS pii
SET quantity_per_unit = 1000, updated_at = NOW()
FROM prep_items AS pi
WHERE pii.prep_item_id = pi.id
  AND lower(btrim(pi.name)) = lower(btrim('Mediterranean salad / Medi salad'))
  AND EXISTS (
    SELECT 1 FROM raw_ingredients ri
    WHERE ri.id = pii.raw_ingredient_id AND lower(btrim(ri.name)) = lower(btrim('Tomato'))
  );

UPDATE prep_item_ingredients AS pii
SET quantity_per_unit = 1470, updated_at = NOW()
FROM prep_items AS pi
WHERE pii.prep_item_id = pi.id
  AND lower(btrim(pi.name)) = lower(btrim('Mediterranean salad / Medi salad'))
  AND EXISTS (
    SELECT 1 FROM raw_ingredients ri
    WHERE ri.id = pii.raw_ingredient_id AND lower(btrim(ri.name)) = lower(btrim('Cucumber'))
  );

UPDATE prep_item_ingredients AS pii
SET quantity_per_unit = 1, updated_at = NOW()
FROM prep_items AS pi
WHERE pii.prep_item_id = pi.id
  AND lower(btrim(pi.name)) = lower(btrim('Mediterranean salad / Medi salad'))
  AND EXISTS (
    SELECT 1 FROM raw_ingredients ri
    WHERE ri.id = pii.raw_ingredient_id AND lower(btrim(ri.name)) = lower(btrim('Parsley'))
  );

-- Gekookte eieren: 30 stuks per GN 1/6 (018), niet 5400 “stuks” uit gram-sheet
UPDATE prep_item_ingredients AS pii
SET quantity_per_unit = 30, updated_at = NOW()
FROM prep_items AS pi
WHERE pii.prep_item_id = pi.id
  AND lower(btrim(pi.name)) = lower(btrim('Boiled eggs'))
  AND EXISTS (
    SELECT 1 FROM raw_ingredients ri
    WHERE ri.id = pii.raw_ingredient_id AND lower(btrim(ri.name)) = lower(btrim('Eggs'))
  );

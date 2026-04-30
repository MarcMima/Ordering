-- User feedback batch (2026): Bidfood Mon, lentils supplier, packs/units, naming.

-- ─── Bidfood: no delivery on Monday (DB day_of_week 0 = Monday, see admin Suppliers) ───
DELETE FROM supplier_delivery_schedules sds
USING suppliers s
WHERE sds.supplier_id = s.id
  AND lower(btrim(s.name)) = lower(btrim('Bidfood'))
  AND sds.day_of_week = 0;

-- ─── Red lentils: Bidfood preferred, 10 kg bags (align with Green lentils handling) ───
INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
SELECT s.id, ri.id, false
FROM suppliers s
CROSS JOIN raw_ingredients ri
WHERE lower(btrim(s.name)) = lower(btrim('Bidfood'))
  AND lower(btrim(ri.name)) = lower(btrim('Red lentils'))
  AND NOT EXISTS (
    SELECT 1 FROM supplier_ingredients x
    WHERE x.supplier_id = s.id AND x.raw_ingredient_id = ri.id
  );

UPDATE supplier_ingredients si
SET is_preferred = (lower(btrim(s.name)) = lower(btrim('Bidfood')))
FROM suppliers s
WHERE si.supplier_id = s.id
  AND si.raw_ingredient_id IN (
    SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Red lentils'))
  );

UPDATE raw_ingredients
SET
  stocktake_unit_label = 'bag',
  stocktake_content_amount = 10,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Red lentils'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Red lentils'))
);

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple)
SELECT id, 10.0, 'kg', 'both', 'bag', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Red lentils'));

-- ─── Coriander naming (ground vs fresh) ───
UPDATE raw_ingredients
SET name = 'Coriander (ground)', updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Coriander'))
  AND lower(btrim(name)) <> lower(btrim('Coriander (fresh)'));

-- ─── Prep: baba ganoush spelling ───
UPDATE prep_items
SET name = 'Baba ganoush', updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Babe ghanouj'));

-- ─── Cacao powder: single 10 kg box (easier bulk measure); drop pair-of-boxes rule from older migration ───
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'box',
  stocktake_content_amount = 10,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Cacao powder'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Cacao powder'))
);

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple)
SELECT id, 10.0, 'kg', 'both', 'box', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Cacao powder'));

-- ─── Mint: 80 g bags ───
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'bag',
  stocktake_content_amount = 80,
  stocktake_content_unit = 'g',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Mint'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Mint')));

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple)
SELECT id, 80, 'g', 'both', 'bag', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Mint'));

-- ─── Eggs: count by box (90 eggs per box typical wholesale) ───
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'box',
  stocktake_content_amount = 90,
  stocktake_content_unit = 'pcs',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Eggs'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Eggs')));

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, grams_per_piece, pack_purpose, display_unit_label, order_pack_multiple)
SELECT id, 90, 'pcs', NULL, 'both', 'box', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Eggs'));

-- ─── Cucumber: wholesale crate 12 pcs (~300 g each → stocktake/order converts to g for recipes) ───
UPDATE raw_ingredients
SET updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Cucumber'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Cucumber')));

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, grams_per_piece, pack_purpose, display_unit_label, order_pack_multiple)
SELECT id, 12, 'pcs', 300, 'both', 'crate (12 pcs)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Cucumber'));

-- ─── Aubergine: by piece (~350 g); recipes stay in g ───
DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Aubergine')));

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, grams_per_piece, pack_purpose, display_unit_label, order_pack_multiple)
SELECT id, 1, 'pcs', 350, 'both', 'each', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Aubergine'));

-- ─── Romaine lettuce: by head (~500 g) ───
DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Romaine lettuce'))
);

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, grams_per_piece, pack_purpose, display_unit_label, order_pack_multiple)
SELECT id, 1, 'pcs', 500, 'both', 'head', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Romaine lettuce'));

-- ─── Red onion sliced fine: 1 kg bags ordered in multiples of 3 (= one container) ───
UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 3
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Red onion sliced fine'))
  AND ips.size = 1
  AND lower(btrim(ips.size_unit)) IN ('kg', 'kilogram');

-- ─── Tomato brunoise: order/stocktake in 6 kg boxes only (avoid 1 kg ×10 rounding confusion) ───
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Tomato brunoise'))) THEN
    UPDATE raw_ingredients
    SET
      stocktake_unit_label = 'box',
      stocktake_content_amount = 6,
      stocktake_content_unit = 'kg',
      updated_at = NOW()
    WHERE lower(btrim(name)) = lower(btrim('Tomato brunoise'));

    DELETE FROM ingredient_pack_sizes
    WHERE raw_ingredient_id IN (
      SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Tomato brunoise'))
    );

    INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple)
    SELECT id, 6.0, 'kg', 'both', 'box', 1
    FROM raw_ingredients
    WHERE lower(btrim(name)) = lower(btrim('Tomato brunoise'));
  END IF;
END $$;

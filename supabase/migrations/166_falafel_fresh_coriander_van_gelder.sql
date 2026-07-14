-- Falafel/Srug use fresh coriander (Van Gelder), not ground coriander (Tuana).
-- Migration 164 incorrectly linked these preps to Coriander (ground).

DELETE FROM prep_item_ingredients pii
USING prep_items p, raw_ingredients r
WHERE pii.prep_item_id = p.id
  AND pii.raw_ingredient_id = r.id
  AND lower(btrim(r.name)) = lower(btrim('Coriander (ground)'))
  AND lower(btrim(p.name)) IN (lower(btrim('Falafel')), lower(btrim('Srug')));

INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
SELECT p.id, r.id, v.qty
FROM (
  VALUES
    ('Falafel', 'Coriander (fresh)', 370::numeric),
    ('Srug', 'Coriander (fresh)', 320::numeric)
) AS v(prep_name, raw_name, qty)
JOIN prep_items p ON lower(btrim(p.name)) = lower(btrim(v.prep_name))
JOIN location_prep_items lpi ON lpi.prep_item_id = p.id
JOIN raw_ingredients r
  ON r.location_id = lpi.location_id
 AND lower(btrim(r.name)) = lower(btrim(v.raw_name))
ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
  SET quantity_per_unit = EXCLUDED.quantity_per_unit, updated_at = NOW();

-- Ensure fresh coriander is orderable via Van Gelder on every location.
INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
SELECT s.id, r.id, TRUE
FROM raw_ingredients r
JOIN suppliers s
  ON s.location_id = r.location_id
 AND lower(btrim(s.name)) LIKE '%van gelder%'
WHERE lower(btrim(r.name)) = lower(btrim('Coriander (fresh)'))
ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
  SET is_preferred = TRUE, updated_at = NOW();

UPDATE raw_ingredients
SET
  stocktake_visible = TRUE,
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Coriander (fresh)'));

-- Naam Xanthan gum → Xantana; Rose petals + Dried dill van Bidfood naar Tuana (align met huidige master TSV).
-- Idempotent. Ook prep-koppelingen herstellen voor omgevingen waar 053 nog niet kon matchen op Xantana.

UPDATE raw_ingredients
SET name = 'Xantana', updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Xanthan gum'));

DO $$
DECLARE
  loc_id UUID;
  r_id UUID;
  sup_id UUID;
BEGIN
  FOR loc_id IN SELECT id FROM locations
  LOOP
    FOR r_id IN
      SELECT r.id
      FROM raw_ingredients r
      WHERE r.location_id = loc_id
        AND lower(btrim(r.name)) IN (lower(btrim('Rose petals')), lower(btrim('Dried dill')))
    LOOP
      DELETE FROM supplier_ingredients si
      USING suppliers s
      WHERE si.raw_ingredient_id = r_id
        AND si.supplier_id = s.id
        AND lower(btrim(s.name)) = lower(btrim('Bidfood'));

      INSERT INTO suppliers (location_id, name)
      SELECT loc_id, 'Tuana' WHERE NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.location_id = loc_id AND lower(btrim(s.name)) = lower(btrim('Tuana')));

      SELECT id INTO sup_id FROM suppliers WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Tuana')) LIMIT 1;
      INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
      VALUES (sup_id, r_id, true)
      ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE SET is_preferred = EXCLUDED.is_preferred, updated_at = NOW();
    END LOOP;
  END LOOP;
END $$;

WITH recipe(prep_name, master_raw_name, qty_per_unit) AS (
  VALUES
    ('Tzatziki', 'Dried dill', 45::numeric),
    ('Srug', 'Xantana', 0.6),
    ('Rose lemonade', 'Rose petals', 45)
),
agg AS (
  SELECT prep_name, master_raw_name, SUM(qty_per_unit) AS qty_per_unit
  FROM recipe
  GROUP BY prep_name, master_raw_name
)
INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
SELECT p.id, r.id, agg.qty_per_unit
FROM agg
JOIN prep_items p ON lower(btrim(p.name)) = lower(btrim(agg.prep_name))
JOIN location_prep_items lpi ON lpi.prep_item_id = p.id
JOIN raw_ingredients r
  ON r.location_id = lpi.location_id
 AND lower(btrim(r.name)) = lower(btrim(agg.master_raw_name))
ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit,
    updated_at = NOW();

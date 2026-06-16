-- Rice flour (cauliflower coating) and Rice parboiled (turmeric rice) are separate products.
-- 107 incorrectly renamed Rice flour → Rice parboiled; restore both.

-- ─── Rice flour: own raw ingredient again (box 10 kg, Bidfood) ───────────────
DO $$
DECLARE
  loc_id UUID;
  rid_flour UUID;
  rid_parboiled UUID;
  sup_id UUID;
BEGIN
  FOR loc_id IN SELECT id FROM locations
  LOOP
    SELECT id INTO rid_parboiled
    FROM raw_ingredients
    WHERE location_id = loc_id AND lower(btrim(name)) = 'rice parboiled'
    LIMIT 1;

    SELECT id INTO rid_flour
    FROM raw_ingredients
    WHERE location_id = loc_id AND lower(btrim(name)) = 'rice flour'
    LIMIT 1;

    IF rid_flour IS NULL THEN
      INSERT INTO raw_ingredients (
        location_id, name, unit, stocktake_visible,
        stocktake_unit_label, stocktake_content_amount, stocktake_content_unit
      )
      VALUES (loc_id, 'Rice flour', 'g', TRUE, 'box', 10.0, 'kg')
      RETURNING id INTO rid_flour;
    ELSE
      UPDATE raw_ingredients
      SET
        name = 'Rice flour',
        unit = 'g',
        stocktake_visible = TRUE,
        stocktake_unit_label = 'box',
        stocktake_content_amount = 10,
        stocktake_content_unit = 'kg',
        updated_at = NOW()
      WHERE id = rid_flour;
    END IF;

    DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid_flour;
    INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple)
    VALUES (rid_flour, 10.0, 'kg', 'both', 'box (10 kg)', 1);

    INSERT INTO suppliers (location_id, name)
    SELECT loc_id, 'Bidfood'
    WHERE NOT EXISTS (
      SELECT 1 FROM suppliers s
      WHERE s.location_id = loc_id AND lower(btrim(s.name)) = 'bidfood'
    );

    SELECT id INTO sup_id
    FROM suppliers
    WHERE location_id = loc_id AND lower(btrim(name)) = 'bidfood'
    LIMIT 1;

    INSERT INTO supplier_ingredients (supplier_id, raw_ingredient_id, is_preferred)
    VALUES (sup_id, rid_flour, TRUE)
    ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
    SET is_preferred = TRUE, updated_at = NOW();

    -- Parboiled keeps art. 055350 (not on flour)
    IF rid_parboiled IS NOT NULL THEN
      UPDATE raw_ingredients
      SET
        name = 'Rice parboiled',
        stocktake_unit_label = 'bag',
        stocktake_content_amount = 10,
        stocktake_content_unit = 'kg',
        stocktake_visible = TRUE,
        updated_at = NOW()
      WHERE id = rid_parboiled;

      DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid_parboiled;
      INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple)
      VALUES (rid_parboiled, 10.0, 'kg', 'both', 'bag (10 kg)', 1);

      UPDATE supplier_ingredients si
      SET
        supplier_sku = '055350ZK',
        ean_code = '03039821610034',
        supplier_article_code = '055350',
        supplier_article_name = 'RIJST PARBOILED',
        order_unit = 'ZK',
        is_preferred = TRUE,
        updated_at = NOW()
      FROM suppliers s
      WHERE si.supplier_id = s.id
        AND si.raw_ingredient_id = rid_parboiled
        AND s.location_id = loc_id
        AND lower(btrim(s.name)) = 'bidfood';

      -- Remove parboiled codes from flour if they were copied onto the wrong link
      UPDATE supplier_ingredients si
      SET
        supplier_sku = NULL,
        ean_code = NULL,
        supplier_article_code = NULL,
        supplier_article_name = NULL,
        order_unit = NULL,
        updated_at = NOW()
      FROM suppliers s
      WHERE si.supplier_id = s.id
        AND si.raw_ingredient_id = rid_flour
        AND s.location_id = loc_id
        AND lower(btrim(s.name)) = 'bidfood'
        AND si.supplier_article_code = '055350';
    END IF;
  END LOOP;
END $$;

-- Recipes: turmeric rice + lentil soup → parboiled only
UPDATE prep_item_ingredients pii
SET raw_ingredient_id = parboiled.id, updated_at = NOW()
FROM prep_items pi, raw_ingredients basmati, raw_ingredients parboiled
WHERE pii.prep_item_id = pi.id
  AND pii.raw_ingredient_id = basmati.id
  AND parboiled.location_id = basmati.location_id
  AND lower(btrim(parboiled.name)) = 'rice parboiled'
  AND lower(btrim(pi.name)) IN ('turmeric rice', 'lebanese lentil soup')
  AND lower(btrim(basmati.name)) = 'rice basmati';

-- ─── Red cabbage shredded: bag 3.5 kg ───────────────────────────────────────
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'bag',
  stocktake_content_amount = 3.5,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Red cabbage shredded'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Red cabbage shredded'))
);

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple)
SELECT id, 3.5, 'kg', 'both', 'bag (3.5 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Red cabbage shredded'));

UPDATE raw_ingredients
SET stocktake_display_order = 420, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Rice flour'));

UPDATE raw_ingredients
SET stocktake_display_order = 425, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Rice parboiled'));

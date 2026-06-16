-- User feedback: stocktake/order units, rice parboiled, Medi salad VG, weekly disposables.

-- ─── Finished products ───────────────────────────────────────────────────────
UPDATE prep_items
SET unit = 'GN 1/2', content_amount = 3000, content_unit = 'g', updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Coated Cauliflower'));

UPDATE prep_items
SET unit = 'can', content_amount = 10, content_unit = 'L', updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Pickling liquid'));

-- ─── Rice parboiled (art. 055350) — see 108: Rice flour stays separate ───────
-- Adds parboiled where the master row was still named Rice flour (superseded by 108).
UPDATE raw_ingredients
SET
  name = 'Rice parboiled',
  stocktake_unit_label = 'bag',
  stocktake_content_amount = 10,
  stocktake_content_unit = 'kg',
  stocktake_visible = TRUE,
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Rice flour'))
  AND NOT EXISTS (
    SELECT 1 FROM raw_ingredients r2
    WHERE r2.location_id = raw_ingredients.location_id
      AND lower(btrim(r2.name)) = 'rice parboiled'
      AND r2.id <> raw_ingredients.id
  );

-- Rice basmati niet gebruikt; pandan blijft voor soep (zie 109).
UPDATE raw_ingredients
SET stocktake_visible = FALSE, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Rice basmati'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Rice parboiled'))
);

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple)
SELECT id, 10.0, 'kg', 'both', 'bag (10 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Rice parboiled'));

UPDATE supplier_ingredients si
SET
  supplier_sku = '055350ZK',
  ean_code = '03039821610034',
  supplier_article_code = '055350',
  supplier_article_name = 'RIJST PARBOILED',
  order_unit = 'ZK',
  is_preferred = TRUE,
  updated_at = NOW()
FROM suppliers s, raw_ingredients ri
WHERE si.supplier_id = s.id
  AND si.raw_ingredient_id = ri.id
  AND lower(btrim(s.name)) = 'bidfood'
  AND lower(btrim(ri.name)) = 'rice parboiled';

UPDATE prep_item_ingredients pii
SET raw_ingredient_id = parboiled.id, updated_at = NOW()
FROM prep_items pi, raw_ingredients basmati, raw_ingredients parboiled
WHERE pii.prep_item_id = pi.id
  AND pii.raw_ingredient_id = basmati.id
  AND parboiled.location_id = basmati.location_id
  AND lower(btrim(parboiled.name)) = 'rice parboiled'
  AND lower(btrim(pi.name)) IN ('turmeric rice', 'lebanese lentil soup')
  AND lower(btrim(basmati.name)) = 'rice basmati';

-- ─── Red lentils: bag 5 kg (Bidfood; was 10 kg) ─────────────────────────────
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'bag',
  stocktake_content_amount = 5,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Red lentils'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Red lentils'))
);

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple)
SELECT id, 5.0, 'kg', 'both', 'bag (5 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Red lentils'));

-- ─── Cacao powder: box 3.5 kg ───────────────────────────────────────────────
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'box',
  stocktake_content_amount = 3.5,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Cacao powder'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Cacao powder'))
);

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple)
SELECT id, 3.5, 'kg', 'both', 'box (3.5 kg)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Cacao powder'));

-- ─── Cucumber: ~350 g per piece ───────────────────────────────────────────
UPDATE raw_ingredients
SET
  unit = 'g',
  stocktake_unit_label = 'piece',
  stocktake_content_amount = 350,
  stocktake_content_unit = 'g',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Cucumber'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Cucumber'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, grams_per_piece, order_pack_multiple
)
SELECT id, 1.0, 'pcs', 'both', 'piece (~350 g)', 350.0, 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Cucumber'));

-- ─── Aubergine: 1 crate = 14 pieces ─────────────────────────────────────────
UPDATE raw_ingredients
SET
  unit = 'g',
  stocktake_unit_label = 'crate',
  stocktake_content_amount = 14,
  stocktake_content_unit = 'pcs',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Aubergine'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Aubergine'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, grams_per_piece, order_pack_multiple
)
SELECT id, 14.0, 'pcs', 'both', 'crate (14 pcs)', NULL, 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Aubergine'));

-- ─── Red cabbage shredded: bag 3.5 kg (108 reaffirms) ───────────────────────
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

-- ─── Romaine lettuce: order/count per piece ─────────────────────────────────
UPDATE raw_ingredients
SET
  unit = 'g',
  stocktake_unit_label = 'piece',
  stocktake_content_amount = 1,
  stocktake_content_unit = 'pcs',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Romaine lettuce'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Romaine lettuce'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, grams_per_piece, order_pack_multiple
)
SELECT id, 1.0, 'pcs', 'both', 'piece', 500.0, 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Romaine lettuce'));

-- ─── Tomato: box 1 kg; order in 6 (= one crate of 6 boxes) ──────────────────
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'box',
  stocktake_content_amount = 1,
  stocktake_content_unit = 'kg',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Tomato'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Tomato'))
);

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple)
SELECT id, 1.0, 'kg', 'both', 'box (1 kg)', 6
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Tomato'));

-- ─── Drinks: count bottles/cans (pcs), order per tray multiple ──────────────
DO $$
DECLARE
  drink RECORD;
BEGIN
  FOR drink IN
    SELECT *
    FROM (
      VALUES
        ('Coca Cola', 24),
        ('Coca Cola Zero', 24),
        ('Still water', 24),
        ('Sparkling water', 24),
        ('SOOF Mint', 12),
        ('SOOF Cardamom', 12),
        ('SOOF Lavender', 12)
    ) AS t(name, tray_multiple)
  LOOP
    UPDATE raw_ingredients
    SET
      unit = 'pcs',
      stocktake_unit_label = 'bottle',
      stocktake_content_amount = 1,
      stocktake_content_unit = 'pcs',
      updated_at = NOW()
    WHERE lower(btrim(name)) = lower(btrim(drink.name));

    DELETE FROM ingredient_pack_sizes
    WHERE raw_ingredient_id IN (
      SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim(drink.name))
    );

    INSERT INTO ingredient_pack_sizes (
      raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
    )
    SELECT id, 1.0, 'pcs', 'both', 'bottle', drink.tray_multiple
    FROM raw_ingredients
    WHERE lower(btrim(name)) = lower(btrim(drink.name));
  END LOOP;
END $$;

-- ─── Flatbread: bag of 5 pcs (reaffirm 097) ─────────────────────────────────
UPDATE raw_ingredients
SET
  unit = 'g',
  stocktake_unit_label = 'bag',
  stocktake_content_amount = 5,
  stocktake_content_unit = 'pcs',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Flatbread'));

DELETE FROM ingredient_pack_sizes
WHERE raw_ingredient_id IN (
  SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Flatbread'))
);

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, grams_per_piece, order_pack_multiple
)
SELECT id, 5.0, 'pcs', 'both', 'bag (5 pcs)', 70.0, 65
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Flatbread'));

-- ─── Purchased Medi salad 3 kg (Van Gelder) — separate from in-house prep ───
DO $$
DECLARE
  loc_id UUID;
  rid UUID;
  sup_id UUID;
BEGIN
  FOR loc_id IN SELECT id FROM locations
  LOOP
    SELECT id INTO rid
    FROM raw_ingredients
    WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim('Medi salad 3kg'))
    LIMIT 1;

    IF rid IS NULL THEN
      INSERT INTO raw_ingredients (
        location_id, name, unit, stocktake_visible, stocktake_unit_label,
        stocktake_content_amount, stocktake_content_unit
      )
      VALUES (loc_id, 'Medi salad 3kg', 'g', TRUE, 'tub', 3.0, 'kg')
      RETURNING id INTO rid;
    ELSE
      UPDATE raw_ingredients
      SET
        unit = 'g',
        stocktake_visible = TRUE,
        stocktake_unit_label = 'tub',
        stocktake_content_amount = 3.0,
        stocktake_content_unit = 'kg',
        updated_at = NOW()
      WHERE id = rid;
    END IF;

    DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;
    INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
    VALUES (rid, 3.0, 'kg', 'both', 'tub (3 kg)');

    INSERT INTO suppliers (location_id, name)
    SELECT loc_id, 'Van Gelder'
    WHERE NOT EXISTS (
      SELECT 1 FROM suppliers s
      WHERE s.location_id = loc_id AND lower(btrim(s.name)) = 'van gelder'
    );

    SELECT id INTO sup_id
    FROM suppliers
    WHERE location_id = loc_id AND lower(btrim(name)) = 'van gelder'
    LIMIT 1;

    INSERT INTO supplier_ingredients (
      supplier_id, raw_ingredient_id, is_preferred,
      supplier_sku, ean_code, supplier_article_code, supplier_article_name, order_unit
    )
    VALUES (
      sup_id, rid, TRUE,
      '8713507273175', '8713507273175', '161874', 'Medi salad 3kg', 'ST'
    )
    ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
    SET
      is_preferred = TRUE,
      supplier_sku = EXCLUDED.supplier_sku,
      ean_code = EXCLUDED.ean_code,
      supplier_article_code = EXCLUDED.supplier_article_code,
      supplier_article_name = EXCLUDED.supplier_article_name,
      order_unit = EXCLUDED.order_unit,
      updated_at = NOW();
  END LOOP;
END $$;

-- ─── Weekly: garbage bags + napkins (Bidfood art.nrs) ───────────────────────
DO $$
DECLARE
  loc_id UUID;
  rid UUID;
  sup_id UUID;
  item RECORD;
BEGIN
  FOR item IN
    SELECT *
    FROM (
      VALUES
        (
          'Garbage bags blue 145L (roll 20)',
          '054362',
          'bag',
          20.0,
          'pcs'
        ),
        (
          'Napkins Airlaid white 40x40 (pack 60)',
          '153946',
          'pack',
          60.0,
          'pcs'
        )
    ) AS t(name, article_code, unit_label, content_amount, content_unit)
  LOOP
    FOR loc_id IN SELECT id FROM locations
    LOOP
      SELECT id INTO rid
      FROM raw_ingredients
      WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim(item.name))
      LIMIT 1;

      IF rid IS NULL THEN
        INSERT INTO raw_ingredients (
          location_id, name, unit, order_interval_days,
          stocktake_visible, stocktake_day_of_week,
          stocktake_unit_label, stocktake_content_amount, stocktake_content_unit
        )
        VALUES (
          loc_id, item.name, 'pcs', 7, TRUE, 1,
          item.unit_label, item.content_amount, item.content_unit
        )
        RETURNING id INTO rid;
      ELSE
        UPDATE raw_ingredients
        SET
          order_interval_days = 7,
          stocktake_visible = TRUE,
          stocktake_day_of_week = 1,
          stocktake_unit_label = item.unit_label,
          stocktake_content_amount = item.content_amount,
          stocktake_content_unit = item.content_unit,
          updated_at = NOW()
        WHERE id = rid;
      END IF;

      DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;
      INSERT INTO ingredient_pack_sizes (
        raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label
      )
      VALUES (
        rid, item.content_amount, item.content_unit, 'both',
        item.unit_label || ' (' || item.content_amount::text || ' ' || item.content_unit || ')'
      );

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

      INSERT INTO supplier_ingredients (
        supplier_id, raw_ingredient_id, is_preferred,
        supplier_article_code, supplier_article_name
      )
      VALUES (sup_id, rid, TRUE, item.article_code, item.name)
      ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
      SET
        is_preferred = TRUE,
        supplier_article_code = EXCLUDED.supplier_article_code,
        supplier_article_name = EXCLUDED.supplier_article_name,
        updated_at = NOW();
    END LOOP;
  END LOOP;
END $$;

-- Stocktake sort: Rice parboiled replaces Rice flour slot
UPDATE raw_ingredients
SET stocktake_display_order = 420, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Rice parboiled'));

UPDATE raw_ingredients
SET stocktake_display_order = 1280, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Garbage bags blue 145L (roll 20)'));

UPDATE raw_ingredients
SET stocktake_display_order = 1290, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Napkins Airlaid white 40x40 (pack 60)'));

UPDATE raw_ingredients
SET stocktake_display_order = 430, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Medi salad 3kg'));

-- Summer 2026 kitchen feedback: wholewheat pita back, drink colli stocktake,
-- sunflower oil 15L, West parboiled off stocktake, regular pita base 1.

-- ─── West: hide parboiled rice from weekly stocktake (ordering stays production-gated) ─
UPDATE raw_ingredients
SET stocktake_visible = false, updated_at = NOW()
WHERE location_id = 'ea231a2a-bc44-4ab1-bf26-9dcabdeb7c2a'
  AND lower(btrim(name)) = lower(btrim('Rice parboiled'));

-- ─── Wholewheat pita: visible again + Bidfood 173445 ─────────────────────────
UPDATE prep_items
SET stocktake_visible = true, updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Wholewheat pita with za''atar'));

UPDATE raw_ingredients
SET
  stocktake_visible = true,
  stocktake_unit_label = 'box',
  stocktake_content_amount = 50,
  stocktake_content_unit = 'pcs',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Whole wheat pita bread 15 cm'));

UPDATE location_prep_items lpi
SET base_quantity = 1, updated_at = NOW()
FROM prep_items pi
WHERE lpi.prep_item_id = pi.id
  AND lower(btrim(pi.name)) = lower(btrim('Regular pita with za''atar'));

-- Bidfood article 173445 — Volkoren pitabrood 13-14 cm, doos 50
DO $$
DECLARE
  loc_id UUID;
  rid UUID;
  bidfood_id UUID;
BEGIN
  SELECT id INTO bidfood_id FROM suppliers
  WHERE lower(btrim(name)) = 'bidfood' LIMIT 1;

  FOR loc_id IN SELECT id FROM locations LOOP
    SELECT id INTO rid FROM raw_ingredients
    WHERE location_id = loc_id
      AND lower(btrim(name)) = lower(btrim('Whole wheat pita bread 15 cm'))
    LIMIT 1;

    IF rid IS NULL THEN
      INSERT INTO raw_ingredients (
        location_id, name, unit, stocktake_visible,
        stocktake_unit_label, stocktake_content_amount, stocktake_content_unit
      )
      VALUES (loc_id, 'Whole wheat pita bread 15 cm', 'pcs', true, 'box', 50, 'pcs')
      RETURNING id INTO rid;
    END IF;

    DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;

    INSERT INTO ingredient_pack_sizes (
      raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
    )
    VALUES (rid, 50, 'pcs', 'both', 'box (50 pcs)', 1);

    IF bidfood_id IS NOT NULL THEN
      INSERT INTO supplier_ingredients (
        supplier_id, raw_ingredient_id, supplier_sku, supplier_article_code,
        supplier_article_name, order_unit, is_preferred
      )
      VALUES (
        bidfood_id, rid, '173445DS', '173445',
        'Volkoren pitabrood 13-14cm 110g', 'DS', true
      )
      ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
      SET
        supplier_sku = EXCLUDED.supplier_sku,
        supplier_article_code = EXCLUDED.supplier_article_code,
        supplier_article_name = EXCLUDED.supplier_article_name,
        order_unit = EXCLUDED.order_unit,
        is_preferred = EXCLUDED.is_preferred,
        updated_at = NOW();
    END IF;
  END LOOP;
END $$;

-- Prep → raw link: 1 wholewheat prep box = 50 pcs raw
DO $$
DECLARE
  pi_id UUID;
  loc_id UUID;
  ri_id UUID;
BEGIN
  SELECT id INTO pi_id FROM prep_items
  WHERE lower(btrim(name)) = lower(btrim('Wholewheat pita with za''atar')) LIMIT 1;

  FOR loc_id IN SELECT id FROM locations LOOP
    SELECT id INTO ri_id FROM raw_ingredients
    WHERE location_id = loc_id
      AND lower(btrim(name)) = lower(btrim('Whole wheat pita bread 15 cm'))
    LIMIT 1;
    IF pi_id IS NOT NULL AND ri_id IS NOT NULL THEN
      INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
      VALUES (pi_id, ri_id, 50)
      ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
      SET quantity_per_unit = EXCLUDED.quantity_per_unit;
    END IF;
  END LOOP;
END $$;

-- ─── Drinks stocktake per colli (still/sparkling water stay tray 18) ────────
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'tray',
  stocktake_content_amount = 24,
  stocktake_content_unit = 'pcs',
  updated_at = NOW()
WHERE lower(btrim(name)) IN (lower(btrim('Coca Cola')), lower(btrim('Coca Cola Zero')));

UPDATE ingredient_pack_sizes ips
SET
  display_unit_label = 'tray (24-pack)',
  order_pack_multiple = 24,
  updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) IN (lower(btrim('Coca Cola')), lower(btrim('Coca Cola Zero')))
  AND ips.pack_purpose IN ('order', 'both');

UPDATE raw_ingredients
SET
  stocktake_unit_label = 'tray',
  stocktake_content_amount = 12,
  stocktake_content_unit = 'pcs',
  updated_at = NOW()
WHERE lower(btrim(name)) IN (
  lower(btrim('SOOF Mint')),
  lower(btrim('SOOF Cardamom')),
  lower(btrim('SOOF Lavender'))
);

UPDATE ingredient_pack_sizes ips
SET
  display_unit_label = 'tray (12-pack)',
  order_pack_multiple = 12,
  updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) IN (
    lower(btrim('SOOF Mint')),
    lower(btrim('SOOF Cardamom')),
    lower(btrim('SOOF Lavender'))
  )
  AND ips.pack_purpose IN ('order', 'both');

-- ─── Sunflower oil: 15 L bottle ───────────────────────────────────────────────
UPDATE raw_ingredients
SET
  stocktake_unit_label = 'bottle',
  stocktake_content_amount = 15,
  stocktake_content_unit = 'l',
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Sunflower oil'));

UPDATE ingredient_pack_sizes ips
SET
  size = 15,
  size_unit = 'l',
  display_unit_label = 'bottle (15 L)',
  updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(name)) = lower(btrim('Sunflower oil'))
  AND ips.pack_purpose IN ('order', 'both');

-- ─── Pijp: ensure medi salad appears on prep list (portion tubs into containers) ─
UPDATE location_prep_items lpi
SET base_quantity = GREATEST(COALESCE(lpi.base_quantity, 0), 1), updated_at = NOW()
FROM locations l, prep_items pi
WHERE lpi.location_id = l.id
  AND lpi.prep_item_id = pi.id
  AND lower(btrim(l.name)) LIKE '%pijp%'
  AND lower(btrim(pi.name)) = lower(btrim('Mediterranean salad / Medi salad'));

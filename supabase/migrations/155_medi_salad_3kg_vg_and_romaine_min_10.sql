-- Pijp/Zuidas ordering: VG gekruide komkommer-tom brunoise 3 kg tub (replaces loose tomato + medi cucumber).
-- Romaine: Van Gelder crate is 8–10 heads; app waits until 10 pcs before suggesting an order.

-- ─── Medi salad 3kg raw + Van Gelder link (all locations) ─────────────────────
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

    IF sup_id IS NOT NULL THEN
      INSERT INTO supplier_ingredients (
        supplier_id, raw_ingredient_id, is_preferred,
        supplier_sku, ean_code, supplier_article_code, supplier_article_name, order_unit
      )
      VALUES (
        sup_id, rid, TRUE,
        '8713507273175', '8713507273175', '161874',
        'Gekruide komkommer-tom brunoise 20mm 3kg stuk', 'ST'
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
    END IF;
  END LOOP;
END $$;

-- ─── Romaine lettuce: order in multiples of 10 (VG kist) ────────────────────
UPDATE ingredient_pack_sizes ips
SET order_pack_multiple = 10, updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = lower(btrim('Romaine lettuce'));

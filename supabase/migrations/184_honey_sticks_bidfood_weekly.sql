-- Honey sticks (Bidfood 114291): weekly stocktake item, order per doos (100 sticks).
-- Reorder only when on-hand stock is below 0.2 box (see stockPar in app).

DO $$
DECLARE
  loc_id UUID;
  rid UUID;
  sup_id UUID;
  raw_name TEXT := 'Honey sticks';
BEGIN
  FOR loc_id IN SELECT id FROM locations
  LOOP
    SELECT id INTO rid
    FROM raw_ingredients
    WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim(raw_name))
    LIMIT 1;

    IF rid IS NULL THEN
      INSERT INTO raw_ingredients (
        location_id,
        name,
        unit,
        order_interval_days,
        stocktake_visible,
        stocktake_day_of_week,
        stocktake_unit_label,
        stocktake_content_amount,
        stocktake_content_unit,
        stocktake_display_order
      )
      VALUES (
        loc_id,
        raw_name,
        'pcs',
        7,
        TRUE,
        1,
        'box',
        100.0,
        'pcs',
        1365
      )
      RETURNING id INTO rid;
    ELSE
      UPDATE raw_ingredients
      SET
        unit = 'pcs',
        order_interval_days = 7,
        stocktake_visible = TRUE,
        stocktake_day_of_week = 1,
        stocktake_unit_label = 'box',
        stocktake_content_amount = 100.0,
        stocktake_content_unit = 'pcs',
        stocktake_display_order = COALESCE(stocktake_display_order, 1365),
        updated_at = NOW()
      WHERE id = rid;
    END IF;

    DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;
    INSERT INTO ingredient_pack_sizes (
      raw_ingredient_id,
      size,
      size_unit,
      pack_purpose,
      display_unit_label,
      order_pack_multiple
    )
    VALUES (
      rid,
      100.0,
      'pcs',
      'both',
      'box (100 × 8 g sticks)',
      1
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

    IF sup_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO supplier_ingredients (
      supplier_id,
      raw_ingredient_id,
      is_preferred,
      supplier_sku,
      supplier_article_code,
      supplier_article_name,
      order_unit
    )
    VALUES (
      sup_id,
      rid,
      TRUE,
      '114291DS',
      '114291',
      'Honingsticks 8 gr per stick, doos 100 stuks',
      'DS'
    )
    ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
    SET
      is_preferred = TRUE,
      supplier_sku = EXCLUDED.supplier_sku,
      supplier_article_code = EXCLUDED.supplier_article_code,
      supplier_article_name = EXCLUDED.supplier_article_name,
      order_unit = EXCLUDED.order_unit,
      updated_at = NOW();
  END LOOP;
END $$;

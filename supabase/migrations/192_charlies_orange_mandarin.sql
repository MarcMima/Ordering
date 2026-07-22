-- Charlie's Orange + Charlie's Mandarin: stocktake in bottles (pcs); order in tray colli (12-pack).
-- Bidfood only lists one combined SKU (165077 Orange mandarin biologisch) — both kitchen items link to it.
-- Ordering par: min 1 tray (12 pcs); see stockPar + drinkTrayPar in app.

DO $$
DECLARE
  loc_id UUID;
  rid UUID;
  sup_id UUID;
  item RECORD;
BEGIN
  FOR item IN
    SELECT * FROM (
      VALUES
        ('Charlie''s Orange', 885, '165077', '165077TR', 'Orange mandarin biologisch'),
        ('Charlie''s Mandarin', 887, '165077', '165077TR', 'Orange mandarin biologisch')
    ) AS t(raw_name, display_ord, article_code, sku, article_name)
  LOOP
    FOR loc_id IN SELECT id FROM locations
    LOOP
      SELECT id INTO rid
      FROM raw_ingredients
      WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim(item.raw_name))
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
          item.raw_name,
          'pcs',
          NULL,
          TRUE,
          NULL,
          'piece',
          1.0,
          'pcs',
          item.display_ord
        )
        RETURNING id INTO rid;
      ELSE
        UPDATE raw_ingredients
        SET
          unit = 'pcs',
          order_interval_days = NULL,
          stocktake_visible = TRUE,
          stocktake_day_of_week = NULL,
          stocktake_unit_label = 'piece',
          stocktake_content_amount = 1.0,
          stocktake_content_unit = 'pcs',
          stocktake_display_order = item.display_ord,
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
        12.0,
        'pcs',
        'order',
        'tray (12-pack)',
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

      UPDATE supplier_ingredients si
      SET is_preferred = FALSE, updated_at = NOW()
      WHERE si.raw_ingredient_id = rid AND si.supplier_id <> sup_id;

      INSERT INTO supplier_ingredients (
        supplier_id,
        raw_ingredient_id,
        is_preferred,
        supplier_sku,
        supplier_article_code,
        supplier_article_name,
        order_unit,
        bf_is_active
      )
      VALUES (
        sup_id,
        rid,
        TRUE,
        item.sku,
        item.article_code,
        item.article_name,
        'TR',
        TRUE
      )
      ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
      SET
        is_preferred = TRUE,
        supplier_sku = EXCLUDED.supplier_sku,
        supplier_article_code = EXCLUDED.supplier_article_code,
        supplier_article_name = EXCLUDED.supplier_article_name,
        order_unit = EXCLUDED.order_unit,
        bf_is_active = TRUE,
        updated_at = NOW();
    END LOOP;
  END LOOP;
END $$;

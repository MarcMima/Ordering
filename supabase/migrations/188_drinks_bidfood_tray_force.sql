-- Ensure Coca Cola Zero + Sparkling water are Bidfood-preferred with tray packs.
-- (Drinks are not in prep recipes; ordering uses drinkTrayPar.)

-- Packs: tray colli
DELETE FROM ingredient_pack_sizes ips
USING raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) IN (
    lower(btrim('Coca Cola Zero')),
    lower(btrim('Sparkling water'))
  );

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 24.0, 'pcs', 'both', 'tray (24-pack)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Coca Cola Zero'));

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT id, 18.0, 'pcs', 'both', 'tray (18 bottles)', 1
FROM raw_ingredients
WHERE lower(btrim(name)) = lower(btrim('Sparkling water'));

UPDATE raw_ingredients
SET
  stocktake_visible = TRUE,
  stocktake_unit_label = 'tray',
  stocktake_content_amount = 24,
  stocktake_content_unit = 'pcs',
  stocktake_day_of_week = NULL,
  order_interval_days = NULL,
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Coca Cola Zero'));

UPDATE raw_ingredients
SET
  stocktake_visible = TRUE,
  stocktake_unit_label = 'tray',
  stocktake_content_amount = 18,
  stocktake_content_unit = 'pcs',
  stocktake_day_of_week = NULL,
  order_interval_days = NULL,
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Sparkling water'));

-- Bidfood preferred links (all locations)
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
        ('Coca Cola Zero', '142782', '142782TR', 'COKE ZERO', 'TR'),
        ('Sparkling water', '123893', '123893TR', 'Marie Stella Maris sparkling', 'TR')
    ) AS t(raw_name, article_code, sku, article_name, uom)
  LOOP
    FOR loc_id IN SELECT id FROM locations
    LOOP
      SELECT id INTO rid
      FROM raw_ingredients
      WHERE location_id = loc_id AND lower(btrim(name)) = lower(btrim(item.raw_name))
      LIMIT 1;
      IF rid IS NULL THEN CONTINUE; END IF;

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
      IF sup_id IS NULL THEN CONTINUE; END IF;

      -- Other suppliers for this raw: not preferred
      UPDATE supplier_ingredients si
      SET is_preferred = FALSE, updated_at = NOW()
      WHERE si.raw_ingredient_id = rid AND si.supplier_id <> sup_id;

      INSERT INTO supplier_ingredients (
        supplier_id, raw_ingredient_id, is_preferred,
        supplier_sku, supplier_article_code, supplier_article_name, order_unit
      )
      VALUES (
        sup_id, rid, TRUE,
        item.sku, item.article_code, item.article_name, item.uom
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
  END LOOP;
END $$;

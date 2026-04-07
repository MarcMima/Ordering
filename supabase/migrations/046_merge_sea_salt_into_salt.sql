-- Merge raw ingredient "Sea salt" into "Salt" (single catalog item; master TSV keeps Salt only).
CREATE TEMP TABLE IF NOT EXISTS _salt_merge_staging (d DATE, q NUMERIC) ON COMMIT DROP;

DO $$
DECLARE
  loc UUID;
  rid_salt UUID;
  rid_sea UUID;
BEGIN
  FOR loc IN SELECT id FROM locations
  LOOP
    SELECT id INTO rid_salt FROM raw_ingredients WHERE location_id = loc AND lower(trim(name)) = 'salt' LIMIT 1;
    SELECT id INTO rid_sea FROM raw_ingredients WHERE location_id = loc AND lower(trim(name)) = 'sea salt' LIMIT 1;
    IF rid_salt IS NULL OR rid_sea IS NULL THEN
      CONTINUE;
    END IF;

    -- If prep already links to Salt, drop the Sea salt row (avoids unique violation on UPDATE).
    DELETE FROM prep_item_ingredients p
    WHERE p.raw_ingredient_id = rid_sea
      AND EXISTS (
        SELECT 1 FROM prep_item_ingredients x
        WHERE x.prep_item_id = p.prep_item_id AND x.raw_ingredient_id = rid_salt
      );

    UPDATE prep_item_ingredients SET raw_ingredient_id = rid_salt WHERE raw_ingredient_id = rid_sea;
    DELETE FROM prep_item_ingredients a
    USING prep_item_ingredients b
    WHERE a.prep_item_id = b.prep_item_id
      AND a.raw_ingredient_id = rid_salt
      AND b.raw_ingredient_id = rid_salt
      AND a.id > b.id;

    -- If supplier already linked to Salt, drop the Sea salt row (avoids unique violation on UPDATE).
    DELETE FROM supplier_ingredients si
    WHERE si.raw_ingredient_id = rid_sea
      AND EXISTS (
        SELECT 1 FROM supplier_ingredients x
        WHERE x.supplier_id = si.supplier_id AND x.raw_ingredient_id = rid_salt
      );

    UPDATE supplier_ingredients SET raw_ingredient_id = rid_salt WHERE raw_ingredient_id = rid_sea;
    DELETE FROM supplier_ingredients a
    USING supplier_ingredients b
    WHERE a.supplier_id = b.supplier_id
      AND a.raw_ingredient_id = rid_salt
      AND b.raw_ingredient_id = rid_salt
      AND a.id > b.id;

    -- If an identical pack row already exists for Salt, drop Sea salt's row first.
    DELETE FROM ingredient_pack_sizes ips
    WHERE ips.raw_ingredient_id = rid_sea
      AND EXISTS (
        SELECT 1 FROM ingredient_pack_sizes x
        WHERE x.raw_ingredient_id = rid_salt
          AND x.size = ips.size
          AND x.size_unit = ips.size_unit
          AND COALESCE(x.pack_purpose, '') = COALESCE(ips.pack_purpose, '')
      );

    UPDATE ingredient_pack_sizes SET raw_ingredient_id = rid_salt WHERE raw_ingredient_id = rid_sea;
    DELETE FROM ingredient_pack_sizes a
    USING ingredient_pack_sizes b
    WHERE a.raw_ingredient_id = rid_salt
      AND b.raw_ingredient_id = rid_salt
      AND a.size = b.size
      AND a.size_unit = b.size_unit
      AND COALESCE(a.pack_purpose, '') = COALESCE(b.pack_purpose, '')
      AND a.id > b.id;

    TRUNCATE _salt_merge_staging;
    INSERT INTO _salt_merge_staging (d, q)
    SELECT date::date, SUM(quantity)
    FROM daily_stock_counts
    WHERE location_id = loc AND raw_ingredient_id IN (rid_salt, rid_sea)
    GROUP BY date;

    DELETE FROM daily_stock_counts
    WHERE location_id = loc AND raw_ingredient_id IN (rid_salt, rid_sea);

    INSERT INTO daily_stock_counts (location_id, date, raw_ingredient_id, quantity)
    SELECT loc, d, rid_salt, q FROM _salt_merge_staging;

    UPDATE order_line_items SET raw_ingredient_id = rid_salt WHERE raw_ingredient_id = rid_sea;

    DELETE FROM raw_ingredients WHERE id = rid_sea;
  END LOOP;
END $$;

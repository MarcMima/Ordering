-- Ordering product-config fixes (13 aug 2026) — uit te voeren in de Supabase SQL editor (prod).
-- Hoort bij branch fix/ordering-advice-consistency. Volgorde: EERST dit script draaien,
-- DAARNA de branch mergen/deployen. Het script is ook veilig onder de huidige code.
--
-- Inhoud:
--   A. Vanille: Dr. Oetker 126817 → Dawn Aroma Mauritius vanille fles 1 kg (381760, FL)
--   B. Charlie's: Orange + Mandarin samenvoegen tot "Charlie's Orange Mandarin";
--      "Charlie's Grapefruit" (144466, tray 12) toevoegen; Mandarin verbergen
--   C. Aubergine puree: bestel-pack = blik 2,83 kg (Bidfood BL), veelvoud 6
--   D. Greek yoghurt 10%: bestel-pack = emmer 1 kg (Bidfood EM), veelvoud 6, par 6 emmers
--   E. Mint: zakje 80 g i.p.v. 1 kg; volle 1/6 GN = 40 g (was 500 g)
--   F. Pijp: komkommer → Komkommer brunoise 10mm 1kg kist 6 stuks (VG 161341 / EAN 8713507203882)
--   G. Tomaat: bestel-pack = kist 6 × 1 kg (VG KST6ST) i.p.v. losse kilo-dozen met deel-veelvoud

BEGIN;

-- ─── A. Vanille: Dawn Aroma Mauritius 381760 (fles 1 kg) i.p.v. Dr. Oetker 126817 ───
UPDATE supplier_ingredients
SET supplier_sku = '381760FL',
    supplier_article_code = '381760',
    supplier_article_name = 'Aroma Mauritius vanille fles 1kg (Dawn)',
    order_unit = 'FL',
    updated_at = NOW()
WHERE supplier_article_code = '126817';

-- ─── B. Charlie's ────────────────────────────────────────────────────────────────
-- B1. Orange → Orange Mandarin (zelfde artikel 165077, alleen de juiste naam).
UPDATE raw_ingredients
SET name = 'Charlie''s Orange Mandarin', updated_at = NOW()
WHERE lower(btrim(name)) = 'charlie''s orange';

-- B2. Mandarin verbergen en loskoppelen (historische tellingen blijven bewaard).
UPDATE raw_ingredients
SET stocktake_visible = FALSE, updated_at = NOW()
WHERE lower(btrim(name)) = 'charlie''s mandarin';

DELETE FROM supplier_ingredients si
USING raw_ingredients ri
WHERE si.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = 'charlie''s mandarin';

-- B3. Grapefruit toevoegen per locatie (Bidfood 144466, tray 12 blikken).
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
    WHERE location_id = loc_id AND lower(btrim(name)) = 'charlie''s grapefruit'
    LIMIT 1;

    IF rid IS NULL THEN
      INSERT INTO raw_ingredients (
        location_id, name, unit,
        stocktake_visible, stocktake_unit_label,
        stocktake_content_amount, stocktake_content_unit,
        stocktake_display_order,
        stock_par_kind, stock_par_min_packs, stock_par_order_packs
      )
      VALUES (
        loc_id, 'Charlie''s Grapefruit', 'pcs',
        TRUE, 'piece', 1.0, 'pcs', 889,
        'packs', 1, 1
      )
      RETURNING id INTO rid;
    END IF;

    DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;
    INSERT INTO ingredient_pack_sizes (
      raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
    )
    VALUES (rid, 12.0, 'pcs', 'order', 'tray (12-pack)', 1);

    SELECT id INTO sup_id
    FROM suppliers
    WHERE location_id = loc_id AND lower(btrim(name)) = 'bidfood'
    LIMIT 1;
    IF sup_id IS NULL THEN CONTINUE; END IF;

    INSERT INTO supplier_ingredients (
      supplier_id, raw_ingredient_id, is_preferred,
      supplier_sku, supplier_article_code, supplier_article_name,
      order_unit, bf_is_active
    )
    VALUES (
      sup_id, rid, TRUE,
      '144466TR', '144466', 'Organics sprankelend water grapefruit biologisch',
      'TR', TRUE
    )
    ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
    SET is_preferred = TRUE,
        supplier_sku = EXCLUDED.supplier_sku,
        supplier_article_code = EXCLUDED.supplier_article_code,
        supplier_article_name = EXCLUDED.supplier_article_name,
        order_unit = EXCLUDED.order_unit,
        bf_is_active = TRUE,
        updated_at = NOW();
  END LOOP;
END $$;

-- ─── C. Aubergine puree: pack = blik 2,83 kg (BL), bestellen per 6 blikken ───────
-- Bidfood verkoopt per blik (order_unit BL); de "case (6 × 2.83 kg)" pack liet de app
-- 1 sturen waar 6 blikken bedoeld waren.
UPDATE ingredient_pack_sizes ips
SET size = 2.83, size_unit = 'kg',
    display_unit_label = 'can (2.83 kg)',
    order_pack_multiple = 6, updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = 'aubergine puree'
  AND ips.pack_purpose IN ('order', 'both');

UPDATE raw_ingredients
SET order_pack_multiple = 6, updated_at = NOW()
WHERE lower(btrim(name)) = 'aubergine puree';

-- ─── D. Greek yoghurt 10%: pack = emmer 1 kg (EM), bestellen per 6, par 6 emmers ─
UPDATE ingredient_pack_sizes ips
SET size = 1.0, size_unit = 'kg',
    display_unit_label = 'bucket (1 kg)',
    order_pack_multiple = 6, updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = 'greek yoghurt 10%'
  AND ips.pack_purpose IN ('order', 'both');

UPDATE raw_ingredients
SET order_pack_multiple = 6,
    stock_par_kind = 'packs', stock_par_min_packs = 6,
    updated_at = NOW()
WHERE lower(btrim(name)) = 'greek yoghurt 10%';

-- ─── E. Mint: zakje 80 g (VG "Mint 75-80gr"); volle 1/6 GN = 40 g ────────────────
UPDATE ingredient_pack_sizes ips
SET size = 80, size_unit = 'g',
    display_unit_label = 'bag (80 g)', updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = 'mint';

UPDATE raw_ingredients
SET stocktake_unit_label = 'bag (80 g)',
    stocktake_content_amount = 80, stocktake_content_unit = 'g',
    updated_at = NOW()
WHERE lower(btrim(name)) = 'mint';

UPDATE prep_items
SET content_amount = 40, content_unit = 'g', updated_at = NOW()
WHERE lower(btrim(name)) = 'mint';

UPDATE prep_item_ingredients pii
SET quantity_per_unit = 40, updated_at = NOW()
FROM prep_items pi, raw_ingredients ri
WHERE pii.prep_item_id = pi.id
  AND pii.raw_ingredient_id = ri.id
  AND lower(btrim(pi.name)) = 'mint'
  AND lower(btrim(ri.name)) = 'mint';

-- ─── F. Pijp: komkommer → Komkommer brunoise 10mm 1kg, kist 6 stuks (161341) ─────
-- Naam blijft "Cucumber" (code koppelt op die naam); levering/telling wordt de brunoise.
DO $$
DECLARE
  pijp_id UUID;
  rid UUID;
BEGIN
  SELECT id INTO pijp_id FROM locations WHERE name = 'Mima Pijp';
  IF pijp_id IS NULL THEN RAISE EXCEPTION 'Locatie Mima Pijp niet gevonden'; END IF;

  SELECT id INTO rid
  FROM raw_ingredients
  WHERE location_id = pijp_id AND lower(btrim(name)) = 'cucumber'
  LIMIT 1;
  IF rid IS NULL THEN RAISE EXCEPTION 'Cucumber (Pijp) niet gevonden'; END IF;

  -- Telling in zakken van 1 kg i.p.v. stuks van 350 g.
  UPDATE raw_ingredients
  SET stocktake_unit_label = 'bag (1 kg)',
      stocktake_content_amount = 1, stocktake_content_unit = 'kg',
      order_pack_multiple = 1,
      updated_at = NOW()
  WHERE id = rid;

  -- Bestel-pack = kist van 6 × 1 kg (VG KST6ST).
  DELETE FROM ingredient_pack_sizes WHERE raw_ingredient_id = rid;
  INSERT INTO ingredient_pack_sizes (
    raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
  )
  VALUES (rid, 6.0, 'kg', 'order', 'kist (6 × 1 kg)', 1);

  UPDATE supplier_ingredients
  SET supplier_sku = '8713507203882',
      ean_code = '8713507203882',
      supplier_article_code = '161341',
      supplier_article_name = 'Komkommer brunoise 10mm 1kg kist 6 stuks',
      order_unit = 'KST6ST', order_unit_size = 6,
      updated_at = NOW()
  WHERE raw_ingredient_id = rid;
END $$;

-- ─── G. Tomaat: bestel-pack = kist 6 × 1 kg (KST6ST); telling blijft per kilo-doos ─
-- Nodig zodat de nieuwe colli-afronding (veelvoud i.p.v. delen) geen 6× te veel bestelt.
UPDATE ingredient_pack_sizes ips
SET pack_purpose = 'stocktake', order_pack_multiple = 1, updated_at = NOW()
FROM raw_ingredients ri
WHERE ips.raw_ingredient_id = ri.id
  AND lower(btrim(ri.name)) = 'tomato'
  AND ips.pack_purpose IN ('order', 'both');

INSERT INTO ingredient_pack_sizes (
  raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label, order_pack_multiple
)
SELECT ri.id, 6.0, 'kg', 'order', 'kist (6 × 1 kg)', 1
FROM raw_ingredients ri
WHERE lower(btrim(ri.name)) = 'tomato'
  AND NOT EXISTS (
    SELECT 1 FROM ingredient_pack_sizes x
    WHERE x.raw_ingredient_id = ri.id AND x.pack_purpose = 'order' AND x.size = 6.0
  );

UPDATE raw_ingredients
SET order_pack_multiple = 1, updated_at = NOW()
WHERE lower(btrim(name)) = 'tomato';

COMMIT;

-- Controle achteraf (verwacht: vanille 381760/FL; charlie's 2 actieve items;
-- aubergine can 2.83 ×6; yoghurt bucket 1kg ×6; mint bag 80 g & GN 40 g;
-- Pijp komkommer 161341 kist; tomaat order-pack kist 6 kg):
-- SELECT ri.name, ips.size, ips.size_unit, ips.display_unit_label, ips.pack_purpose,
--        COALESCE(ri.order_pack_multiple, ips.order_pack_multiple) AS colli_step
-- FROM raw_ingredients ri
-- LEFT JOIN ingredient_pack_sizes ips ON ips.raw_ingredient_id = ri.id
-- WHERE lower(ri.name) IN ('vanilla extract','charlie''s orange mandarin','charlie''s grapefruit',
--   'aubergine puree','greek yoghurt 10%','mint','cucumber','tomato')
-- ORDER BY ri.name, ips.pack_purpose;

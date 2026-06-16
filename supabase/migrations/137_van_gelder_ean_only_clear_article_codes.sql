-- Van Gelder: alleen EAN voor bestellen/sync; artikelnummer niet meer opslaan.
-- supplier_sku = EAN waar beschikbaar (geen 6-cijferig VG-artikelnummer meer).

UPDATE supplier_ingredients si
SET
  supplier_article_code = NULL,
  supplier_sku = CASE
    WHEN si.ean_code IS NOT NULL AND btrim(si.ean_code) <> '' THEN btrim(si.ean_code)
    ELSE si.supplier_sku
  END,
  updated_at = NOW()
FROM suppliers s
WHERE si.supplier_id = s.id
  AND lower(btrim(s.name)) LIKE '%van gelder%'
  AND (
    si.supplier_article_code IS NOT NULL
    OR (
      si.ean_code IS NOT NULL
      AND btrim(si.ean_code) <> ''
      AND btrim(COALESCE(si.supplier_sku, '')) <> btrim(si.ean_code)
    )
  );

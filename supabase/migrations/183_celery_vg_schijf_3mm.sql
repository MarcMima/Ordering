-- Celery (raw: Celery brunoise): switch Van Gelder from brunoise 10mm to schijf 3mm zak 1kg.
-- VG art. 161450, EAN 8713507206074 (was 161273 / 8713507200638).

UPDATE supplier_ingredients si
SET
  supplier_article_code = '161450',
  ean_code = '8713507206074',
  supplier_sku = '8713507206074',
  supplier_article_name = 'Bleekselderij schijf 3mm zak 1kg stuk',
  order_unit = 'ST',
  vg_is_active = TRUE,
  vg_last_status = 'mima-assortiment',
  vg_last_checked_at = NOW(),
  notes = COALESCE(si.notes, '') || CASE
    WHEN COALESCE(si.notes, '') = '' THEN 'VG celery: brunoise 10mm → schijf 3mm (jul 2026).'
    WHEN si.notes LIKE '%schijf 3mm%' THEN si.notes
    ELSE si.notes || ' VG celery: brunoise 10mm → schijf 3mm (jul 2026).'
  END,
  updated_at = NOW()
FROM raw_ingredients r
JOIN suppliers s ON lower(s.name) LIKE '%van gelder%'
WHERE si.raw_ingredient_id = r.id
  AND si.supplier_id = s.id
  AND si.is_preferred = TRUE
  AND lower(btrim(r.name)) = lower(btrim('Celery brunoise'));

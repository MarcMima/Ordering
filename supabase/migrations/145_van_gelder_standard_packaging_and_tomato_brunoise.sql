-- Van Gelder master data: juiste variant + standaard (grotere) verpakking.
-- Tomaten → brunoise (niet ongesneden Tomaten A).
-- Aubergine, rode kool → krat i.p.v. los stuk/zak.
-- Ui gepeld → 5 kg stuk (bevestigd).

WITH vg_standard (
  raw_name,
  supplier_article_code,
  ean_code,
  supplier_article_name,
  order_unit,
  order_unit_size
) AS (
  VALUES
    ('Aubergine', '115167', '8713507227734', 'Aubergine kist 14 stuks', 'KST14ST', 14::numeric),
    ('Red cabbage shredded', '161329', '8713507203646', 'Rode kool 1x gesneden 2,5kg kist 2 stuks', 'KST2ST', 2::numeric),
    ('Tomato', '161452', '8713507206142', 'Tomaten brunoise 20mm 1kg kist 6 stuks', 'KST6ST', 6::numeric),
    ('Onion peeled', '106638', '8713507232660', 'Uien heel schoon 5 kg stuk', 'ST', 5::numeric),
    ('Red onion sliced fine', '106649', '8713507249699', 'Rode uien ringen fijn 2mm 1kg kist 12 stuks', 'KST12ST', 12::numeric)
)
UPDATE supplier_ingredients si
SET
  supplier_article_code = v.supplier_article_code,
  ean_code = v.ean_code,
  supplier_sku = v.ean_code,
  supplier_article_name = v.supplier_article_name,
  order_unit = v.order_unit,
  order_unit_size = v.order_unit_size,
  vg_is_active = TRUE,
  vg_last_status = 'standard-packaging-145',
  vg_last_checked_at = NOW(),
  updated_at = NOW()
FROM vg_standard v
JOIN raw_ingredients r ON lower(btrim(r.name)) = lower(btrim(v.raw_name))
JOIN suppliers s ON lower(s.name) LIKE '%van gelder%'
WHERE si.raw_ingredient_id = r.id
  AND si.supplier_id = s.id
  AND si.is_preferred = TRUE;

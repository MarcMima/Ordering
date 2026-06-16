-- Van Gelder codes uit Mima-assortimentlijst (webshop/json-ld, jun 2026).
-- Bron: docs/van-gelder-mima-assortiment.csv
-- Per raw ingredient: één preferred bestelvariant (kist/verpakking waar van toepassing).

WITH mima_vg (
  raw_name,
  supplier_article_code,
  ean_code,
  supplier_article_name,
  order_unit
) AS (
  VALUES
    ('Aubergine', '115167', '8713507227734', 'Aubergine kist 14 stuks', 'KST14ST'),
    ('Cacao powder', '156007', '8713507271379', 'Cacaopoeder BIO emmer 3,5kg kist 2 stuks', 'KST2ST'),
    ('Carrot julienne', '161123', '8713507257069', 'Winterpeen julienne 1mm 1kg stuk', 'ST'),
    ('Celery brunoise', '161273', '8713507200638', 'Bleekselderij brunoise 10 mm zak 1kg stuk', 'ST'),
    ('Chickpeas', '150015', '8713507239300', 'Kikkererwten kist 10 kilogram', 'KST10KG'),
    ('Coriander (fresh)', '142063', '8713507199505', 'Koriander los kist 1 kilogram', 'KST1KG'),
    ('Cucumber', '110182', '8713507230321', 'Komkommers kist 12 stuks', 'KST12ST'),
    ('Flaxseed broken', '153020', '8713507273304', 'Gebroken lijnzaad 850gr kist 8 stuks', 'KST8ST'),
    ('Garlic peeled', '115962', '8713507159356', 'Knoflook gepeld-schoon 1kg stuk', 'ST'),
    ('Garlic puree', '193008', '8713507047714', 'Knoflook puree 1kg stuk', 'ST'),
    ('Green chili', '118385', '8713507179392', 'Rawit groen doos 2kg stuk', 'ST'),
    ('Green lentils', '150009', '8713507268133', 'Groene linzen los kist 10 kilogram', 'KST10KG'),
    ('Medi salad 3kg', '161874', '8713507273175', 'Gekruide komkommer-tom brunoise 20mm 3kg stuk', 'ST'),
    ('Mint', '100874', '8713507023046', 'Mint 75-80gr stuk', 'ST'),
    ('Onion peeled', '106638', '8713507232660', 'Uien heel schoon 5 kg stuk', 'ST'),
    ('Parsley', '142077', '8713507199536', 'Bladpeterselie los kist 1 kilogram', 'KST1KG'),
    ('Pomegranate seeds', '166195', '8713507182545', 'Granaatappelpitten los 1kg stuk', 'ST'),
    ('Red cabbage shredded', '161329', '8713507203646', 'Rode kool 1x gesneden 2,5kg kist 2 stuks', 'KST2ST'),
    ('Red lentils', '150002', '8713507042436', 'Rode Linzen 500gr stuk', 'ST'),
    ('Red onion sliced fine', '106649', '8713507249699', 'Rode uien ringen fijn 2mm 1kg kist 12 stuks', 'KST12ST'),
    ('Romaine lettuce', '100081', '8713507002898', 'Romeinse sla kist 8 stuks', 'KST8ST'),
    ('Tomato', '100209', '8713507008630', 'Tomaten A kist 6 kilogram', 'KST6KG')
)
UPDATE supplier_ingredients si
SET
  supplier_article_code = m.supplier_article_code,
  ean_code = m.ean_code,
  supplier_sku = m.ean_code,
  supplier_article_name = m.supplier_article_name,
  order_unit = COALESCE(m.order_unit, si.order_unit),
  vg_is_active = TRUE,
  vg_last_status = 'mima-assortiment',
  vg_last_checked_at = NOW(),
  notes = COALESCE(si.notes, '') || CASE
    WHEN COALESCE(si.notes, '') = '' THEN 'VG codes bijgewerkt uit Mima-assortimentlijst (jun 2026).'
    WHEN si.notes LIKE '%Mima-assortimentlijst%' THEN si.notes
    ELSE si.notes || ' VG codes bijgewerkt uit Mima-assortimentlijst (jun 2026).'
  END,
  updated_at = NOW()
FROM mima_vg m
JOIN raw_ingredients r ON lower(btrim(r.name)) = lower(btrim(m.raw_name))
JOIN suppliers s ON lower(s.name) LIKE '%van gelder%'
WHERE si.raw_ingredient_id = r.id
  AND si.supplier_id = s.id
  AND si.is_preferred = TRUE;

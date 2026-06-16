-- GeDe article codes from reviewed Bestellijst MIMAAMST01 (docs/gede-bestellijst-mapping-review.xlsx).
-- Unprinted stock napkins (08056) are not mapped — order via EN5055 only.

-- Packaging for Rose lemonade (1 bottle per finished bottle in prep output batch of 10).
INSERT INTO raw_ingredients (
  location_id,
  name,
  unit,
  order_interval_days,
  stocktake_visible,
  stocktake_day_of_week,
  stocktake_unit_label,
  stocktake_content_amount,
  stocktake_content_unit
)
SELECT
  l.id,
  'Plastic bottle (rose lemonade)',
  'pcs',
  7,
  TRUE,
  1,
  'Box',
  108.0,
  'pcs'
FROM locations l
WHERE NOT EXISTS (
  SELECT 1
  FROM raw_ingredients ri
  WHERE ri.location_id = l.id
    AND lower(btrim(ri.name)) = lower(btrim('Plastic bottle (rose lemonade)'))
);

INSERT INTO ingredient_pack_sizes (raw_ingredient_id, size, size_unit, pack_purpose, display_unit_label)
SELECT ri.id, 108.0, 'pcs', 'order', 'box'
FROM raw_ingredients ri
WHERE lower(btrim(ri.name)) = lower(btrim('Plastic bottle (rose lemonade)'))
  AND NOT EXISTS (
    SELECT 1
    FROM ingredient_pack_sizes ips
    WHERE ips.raw_ingredient_id = ri.id
      AND lower(btrim(ips.pack_purpose)) = 'order'
  );

-- Rose lemonade: 10 finished bottles per prep batch → 10 empty bottles per batch.
INSERT INTO prep_item_ingredients (prep_item_id, raw_ingredient_id, quantity_per_unit)
SELECT p.id, ri.id, 10.0
FROM prep_items p
JOIN location_prep_items lpi ON lpi.prep_item_id = p.id
JOIN raw_ingredients ri
  ON ri.location_id = lpi.location_id
 AND lower(btrim(ri.name)) = lower(btrim('Plastic bottle (rose lemonade)'))
WHERE lower(btrim(p.name)) = lower(btrim('Rose lemonade'))
ON CONFLICT (prep_item_id, raw_ingredient_id) DO UPDATE
SET quantity_per_unit = EXCLUDED.quantity_per_unit, updated_at = NOW();

WITH gede_map (
  raw_name,
  supplier_article_code,
  supplier_article_name,
  order_unit
) AS (
  VALUES
    ('Lids (pita)', 'EN5054', 'Ronde deksels Pet anti-fog 185 mm (MIMA print)', 'STUKS'),
    ('Paper bags small', 'EN5030', 'Papieren-draagtassen PAPIER Bruin 70 g (MIMA print)', 'STUKS'),
    ('Rolling paper', 'EN5052', 'Vellen GREASEPROOF Wit 40 g 420x310 mm (MIMA print)', 'KG'),
    ('Paper bags large', 'EN5040', 'Papieren-draagtassen PAPIER Bruin 80 g (MIMA print)', 'STUKS'),
    ('Lids (bowl)', 'EN5053', 'Ronde deksels Pet anti-fog 150 mm (MIMA print)', 'STUKS'),
    ('Pita pouches', 'EN5051', 'Zak papier HAMBURGERZAKJES Bruin 55 g (MIMA print)', 'STUKS'),
    ('Paper bag (brownies)', 'EN5050', 'Zak papier 1 POND KOEKZAKKEN (MIMA print)', 'KG'),
    ('Mezze container', '00742', '102 BAK ROND 350cc TRANSP PP 115x56mm (102 serie)', 'STUKS'),
    ('Mezze lids', '01238', '102 DEKSEL ROND TRANSP PP 115mm (102D) 102 SERIE', 'STUKS'),
    ('Sauce cup', '1026E', '70,2 SAUS BAK 50cc SAUSCUP', 'STUKS'),
    ('Sauce lid', '1137F', '70,2 SAUS DEKSEL SAUSCUP (CPDE070A)', 'STUKS'),
    ('Falafel container', '09348', 'IMP 150 BAK ROND 500cc KRAFT SALADBOWL 150x45mm', 'STUKS'),
    ('Pita container', '09349', 'IMP 150 BAK ROND 1000cc KRAFT SALADBOWL 150x78mm', 'STUKS'),
    ('Bowl container', '10015', 'IMP SALADBOWL BAK 1100cc ROND 185x60mm KRAFT', 'STUKS'),
    ('Catering container', '07542', 'IMP LUNCH BOX KRAFT 2000cc 215x160x63mm', 'STUKS'),
    ('Cutlery', '04620', 'BESTEKSET HOUT VORK/MES/SERVET 165 mm', 'STUKS'),
    ('Coffee cup', '06876', 'COFFEE 90r 360cc 12oz BEKER KRAFT', 'STUKS'),
    ('Coffee lids', '09401', 'COFFEE 90r DEKSEL ZWART PS', 'STUKS'),
    ('Napkins', 'EN5055', 'Servetten Tissue Wit 330x330 mm (MIMA print)', 'STUKS'),
    ('Soup container', '09365', 'IMP 96 BAK SOUP TO GO 450ml 16 oz', 'STUKS'),
    ('Soup lids', '09366', 'IMP 96 DEKSEL SOUP TO GO 96mm', 'STUKS'),
    ('Plastic bottle (rose lemonade)', '04434', 'FLES RPET 500 ml MET DOP ZWART', 'STUKS'),
    ('Aluminium foil', '5805K', 'ALUMINIUM ROL 300mm x 200m REFILL', 'ROL'),
    ('Clingfilm', '6001A', 'KUNSTSTOF ROL PVC KLEEFFOLIE 300mm REFILL', 'ROL'),
    ('Centerfeed paper roll', '00962', 'HANDDOEK ROL MIDI MAXI WIT RECYCLED', 'ROL'),
    ('Toiletpaper', '7004A', 'TOILETPAPIER G&CLEAN 2-laags', 'ROL'),
    ('Gloves small', '07453', 'HANDSCHOEN NITRIL ZWART SMALL (10x100)', 'STUKS'),
    ('Gloves medium', '07452', 'HANDSCHOEN NITRIL ZWART MEDIUM (10x100)', 'STUKS'),
    ('Gloves large', '07451', 'HANDSCHOEN NITRIL ZWART LARGE (10x100)', 'STUKS'),
    ('Daysticker Monday', '09824', 'ETIKET MAANDAG voedselroulatie 24x24 mm', 'STUKS'),
    ('Daysticker Tuesday', '09825', 'ETIKET DINSDAG voedselroulatie 24x24 mm', 'STUKS'),
    ('Daysticker Wednesday', '09826', 'ETIKET WOENSDAG voedselroulatie 24x24 mm', 'STUKS'),
    ('Daysticker Thursday', '09827', 'ETIKET DONDERDAG voedselroulatie 24x24 mm', 'STUKS'),
    ('Daysticker Friday', '09828', 'ETIKET VRIJDAG voedselroulatie 24x24 mm', 'STUKS'),
    ('Daysticker Saturday', '09829', 'ETIKET ZATERDAG voedselroulatie 24x24 mm', 'STUKS'),
    ('Daysticker Sunday', '09830', 'ETIKET ZONDAG voedselroulatie 24x24 mm', 'STUKS'),
    ('Flatbreadchips bags with window', '08576', 'ZAK BRUIN KRAFT MET VENSTER TIN TIE 88x47x260 mm', 'STUKS')
)
INSERT INTO supplier_ingredients (
  supplier_id,
  raw_ingredient_id,
  is_preferred,
  supplier_sku,
  supplier_article_code,
  supplier_article_name,
  order_unit
)
SELECT
  s.id,
  ri.id,
  TRUE,
  gm.supplier_article_code,
  gm.supplier_article_code,
  gm.supplier_article_name,
  gm.order_unit
FROM gede_map gm
JOIN raw_ingredients ri
  ON lower(btrim(ri.name)) = lower(btrim(gm.raw_name))
JOIN suppliers s
  ON s.location_id = ri.location_id
 AND lower(btrim(s.name)) IN (
   lower(btrim('GéDé')),
   lower(btrim('Gede')),
   lower(btrim('Gede verpakkingen'))
 )
ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
SET
  is_preferred = EXCLUDED.is_preferred,
  supplier_sku = EXCLUDED.supplier_article_code,
  supplier_article_code = EXCLUDED.supplier_article_code,
  supplier_article_name = EXCLUDED.supplier_article_name,
  order_unit = EXCLUDED.order_unit,
  updated_at = NOW();

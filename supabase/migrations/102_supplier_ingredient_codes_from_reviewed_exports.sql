-- Supplier codes from reviewed match exports in repo root.
-- Source files: exports_bidfood_match_review_Reviewed.xlsx, exports_van_gelder_match_review_Reviewed.xlsx.
-- Text-only review notes (for example not deliverable / supplied elsewhere) are intentionally skipped.

WITH reviewed_codes (raw_id, supplier_name, supplier_sku, ean_code, supplier_article_code, supplier_article_name, order_unit) AS (
  VALUES
    ('417f6602-9980-4645-b05a-a6db5e9a5535', 'Bidfood', '101194DS', NULL, '101194', 'Bravour Essentials', 'DS'), -- Bidfood: All purpose flour
    ('1695db87-4cee-4a92-b760-2124b4b1b90b', 'Bidfood', '012740BS', '09008200050017', '012740', 'BAKPOEDER', 'BS'), -- Bidfood: Baking powder
    ('28814842-3fde-4b2e-b57b-c2f12bfa9e79', 'Bidfood', '148529DJ', '00033200976387', '148529', 'BAKSODA', 'DJ'), -- Bidfood: Baking soda
    ('a0c47724-1e4e-4719-8ec7-2fa0d2e6e151', 'Bidfood', '133947ZK', '08710803044867', '133947', 'BULGUR', 'ZK'), -- Bidfood: Bulgur
    ('add4935b-f704-401a-9850-f4fd073150b0', 'Bidfood', '087088DS', NULL, '087088', 'Bravour Essentials', 'DS'), -- Bidfood: Cauliflower
    ('c34e6c41-3888-4d0c-904a-28a72fddae38', 'Bidfood', '140565DS', '08710803145151', '140565', 'KIPDIJFILET HALAL', 'DS'), -- Bidfood: Chicken
    ('80adcbe2-00c1-4781-9378-3c12d70d9118', 'Bidfood', '142796TR', '05000112659177', '142796', 'COLA REGULAR', 'TR'), -- Bidfood: Coca Cola
    ('42432ae1-2379-48c2-b685-ad247a41150e', 'Bidfood', '142782TR', '05000112659184', '142782', 'COKE ZERO', 'TR'), -- Bidfood: Coca Cola Zero
    ('a9a5c472-9e77-4048-b3c6-33bae05e9605', 'Bidfood', '164405BL', '05060981590957', '164405', 'GER.AUBERGINE PUREE', 'BL'), -- Bidfood: Eggplant puree
    ('fd04c03d-6427-4983-b92b-e059e3cf9188', 'Bidfood', '136912FO', '05701638149530', '136912', 'GRIEKSE FETA 45+ PDO', 'FO'), -- Bidfood: Feta cheese
    ('d0e15264-df1e-4872-bc06-327d9cb1334f', 'Bidfood', '104444EM', '08710803036107', '104444', 'GRIEKSE STIJL YOGH.', 'EM'), -- Bidfood: Greek yoghurt 10%
    ('626643e7-ad29-4db2-9b77-3a1f88fdd166', 'Bidfood', '782790CN', NULL, '782790', 'Isabel', 'CN'), -- Bidfood: Hand soap
    ('d5d45e8e-dca7-442c-882f-8008ad9c94b3', 'Bidfood', '056453PT', '05201043004917', '056453', 'KALAMATA OLIJVEN', 'PT'), -- Bidfood: Kalamata olives
    ('f1e95af6-206f-4ffb-9f92-79bfbf8f0299', 'Bidfood', '098177DS', NULL, '098177', 'Arco', 'DS'), -- Bidfood: Lemon juice
    ('ca5bcd19-abf4-40bc-8c60-619b9cf7b782', 'Bidfood', '151688DS', '08710803147667', '151688', 'MANGO 20X20MM', 'DS'), -- Bidfood: Mango
    ('b355e92b-82f6-4926-874f-182d490b0db3', 'Bidfood', '170025BL', NULL, '170025', 'Med Cuisine', 'BL'), -- Bidfood: Middle Eastern pickles
    ('d8d8860e-076b-4eec-98d7-291157d9ea10', 'Bidfood', '285020DS', '08712200340580', '285020', 'VE-TSIN POEDER', 'DS'), -- Bidfood: MSG (Ve Tsin)
    ('8139732b-4c77-47ce-8654-332ebf9f1c95', 'Bidfood', '123895DS', '08710803142822', '123895', 'HAVERDRINK BARISTA', 'DS'), -- Bidfood: Oat drink barista
    ('e21d2065-eb74-4810-8ee0-e30bcc8f85cd', 'Bidfood', '117030FL', NULL, '117030', 'Bravour Essentials', 'FL'), -- Bidfood: Olive oil
    ('4288c30c-1e24-4f15-9448-b01e7c85373f', 'Bidfood', '165354DS', '07290002066422', '165354', 'PITA LARGE 15CM', 'DS'), -- Bidfood: Pita bread 15 cm
    ('877f4119-5911-4806-94bb-bb7256aaac6e', 'Bidfood', '152891ZK', '08710803049206', '152891', 'LINZEN GEDROOG ROOD', 'ZK'), -- Bidfood: Red lentils
    ('5bce7b4f-3485-4d52-a969-41ed56bb1b91', 'Bidfood', '089581ZK', NULL, '089581', 'Alesie', 'ZK'), -- Bidfood: Rice basmati
    ('7f89ce3d-cb27-4bc5-a9ee-890b15b242d7', 'Bidfood', '055350ZK', '03039821610034', '055350', 'RIJST PARBOILED', 'ZK'), -- Bidfood: Rice flour
    ('a0eec39a-979d-44ed-976a-6e4602e80c55', 'Bidfood', '089581ZK', '00680357332063', '089581', 'PANDAN RIJST', 'ZK'), -- Bidfood: Rice pandan
    ('36ec43e5-18e8-48b1-8e58-a33d88323874', 'Bidfood', '204780EM', NULL, '204780', 'La Baleine', 'EM'), -- Bidfood: Salt
    ('30cf5a04-c866-4998-9ed4-afef9c1df8ed', 'Bidfood', '148912TR', '08719324733946', '148912', 'FRISDR. ROOS CARDAM.', 'TR'), -- Bidfood: SOOF Cardamom
    ('77e71c6d-b85c-4001-8196-7ff7e2812c75', 'Bidfood', '148915TR', NULL, '148915', 'Soof', 'TR'), -- Bidfood: SOOF Lavender
    ('26273d09-8510-41ab-ae73-a4a5ae62e81b', 'Bidfood', '148914TR', '08719324733960', '148914', 'FRISDR. CIT. MINT AP', 'TR'), -- Bidfood: SOOF Mint
    ('975254c7-74ad-42a6-9ad4-045e58ed6e9b', 'Bidfood', '123893TR', NULL, '123893', 'Marie Stella Maris', 'TR'), -- Bidfood: Sparkling water
    ('b6b9259e-3a8c-423c-acb7-86b36bcae3a7', 'Bidfood', '123892TR', NULL, '123892', 'Marie Stella Maris', 'TR'), -- Bidfood: Still water
    ('b44966c8-b562-463d-a8e0-7ad60bde84ad', 'Bidfood', '126019BS', NULL, '126019', 'Bravour Essentials', 'BS'), -- Bidfood: Stock
    ('2f23681d-f865-4ed5-b0be-82b12d2bbb68', 'Bidfood', '173290DS', NULL, '173290', 'Van Gilse', 'DS'), -- Bidfood: Sugar brown
    ('9d31346a-7db4-4940-91c7-b28465b2382f', 'Bidfood', '117401KI', '08710803139693', '117401', 'KRISTALSUIKER WIT', 'KI'), -- Bidfood: Sugar white
    ('c9380d99-5842-4902-91d8-b540b06c1969', 'Bidfood', '076031BX', '08710803129342', '076031', 'ZONNEBLOEMOLIE', 'BX'), -- Bidfood: Sunflower oil
    ('b53f4156-5211-47d6-ab53-5a44dbb0a537', 'Bidfood', '161478BL', '08710803052596', '161478', 'TOMATENPUREE 28-30%', 'BL'), -- Bidfood: Tomato puree
    ('cf2adf7c-7512-4b43-8c71-dbe9b1a7eeb8', 'Bidfood', '126817DS', '08710466294845', '126817', 'VANILLE EXTR.BOURBON', 'DS'), -- Bidfood: Vanilla extract
    ('bff44c95-1154-4938-88bc-b44aeb88cae5', 'Bidfood', '056237CN', NULL, '056237', 'Bravour Essentials', 'CN'), -- Bidfood: Vinegar
    ('04f9370b-d955-4185-b12a-40058d9a3e8e', 'Bidfood', '165354DS', '07290002066422', '165354', 'PITA LARGE 15CM', 'DS'), -- Bidfood: Whole wheat pita bread 15 cm
    ('56f1ad76-bf3d-45e6-b966-6198876fb38d', 'Bidfood', '104444TR', NULL, '104444', 'Bravour Essentials', 'TR'), -- Bidfood: Yoghurt
    ('de517816-8a17-4759-aba6-a36821bed56d', 'Van Gelder', '8713507227734', '8713507227734', '115167', 'Aubergine', 'KST14ST'), -- Van Gelder: Aubergine
    ('261102f2-99ff-4bd8-b356-c0b8611576fd', 'Van Gelder', '8713507271379', '8713507271379', '156007', 'Cacaopoeder BIO emmer 3,5kg', 'KST2ST'), -- Van Gelder: Cacao powder
    ('dfb2ac70-78f2-4245-a3d5-1af15a35a109', 'Van Gelder', '8713507257069', '8713507257069', '161123', 'Winterpeen julienne 1mm 1kg', 'ST'), -- Van Gelder: Carrot julienne
    ('61e725bd-8ae7-48f6-9924-52151f124b49', 'Van Gelder', '8713507200638', '8713507200638', '161273', 'Bleekselderij brunoise 10 mm zak 1kg', 'ST'), -- Van Gelder: Celery brunoise
    ('d2a5ab0a-30e4-49b1-9839-441c4f309dd9', 'Van Gelder', '8713507239300', '8713507239300', '150015', 'Kikkererwten', 'KST10KG'), -- Van Gelder: Chickpeas
    ('e5f863b2-a28f-4c1d-9f89-ffd065493003', 'Van Gelder', '8713507199505', '8713507199505', '142063', 'Koriander los', 'KST1KG'), -- Van Gelder: Coriander (fresh)
    ('16bc9f97-33dc-4224-8680-d68d251aef84', 'Van Gelder', '8713507230321', '8713507230321', '110182', 'Komkommers maat 12', 'KST12ST'), -- Van Gelder: Cucumber
    ('159a7552-fc01-4dd1-9679-4a61eb9eaf0e', 'Van Gelder', '8713507208214', '8713507208214', '250005', 'Scharrel eieren maat L', 'KST90ST'), -- Van Gelder: Eggs
    ('ad8fde72-7119-4525-9cb0-a3fdbe8edcaa', 'Van Gelder', '8713507273304', '8713507273304', '153020', 'Gebroken lijnzaad 850gr', 'KST8ST'), -- Van Gelder: Flaxseed broken
    ('a31a6a79-5780-4bd0-9fc4-545f60566842', 'Van Gelder', '8713507159356', '8713507159356', '115962', 'Knoflook gepeld/schoon 1kg maat 10', 'ST'), -- Van Gelder: Garlic peeled
    ('959d2a01-e344-4841-91aa-ce250fe09516', 'Van Gelder', '8713507047714', '8713507047714', '193008', 'Knoflook puree 1kg', 'ST'), -- Van Gelder: Garlic puree
    ('86441952-fcae-46a4-adeb-c738296f3ba0', 'Van Gelder', '8713507164763', '8713507164763', NULL, 'Peper groen verpakt 500gr', NULL), -- Van Gelder: Green chili
    ('4dced025-0959-41bc-a558-1dc6a6fa2955', 'Van Gelder', '8713507268133', '8713507268133', '150009', 'Groene linzen los', 'KST10KG'), -- Van Gelder: Green lentils
    ('f85879aa-c58f-459a-9d5d-22f453158b53', 'Van Gelder', '8713507023046', '8713507023046', '100874', 'Mint 75/80gr', 'ST'), -- Van Gelder: Mint
    ('e21d2065-eb74-4810-8ee0-e30bcc8f85cd', 'Van Gelder', '8713507158144', '8713507158144', '195019', 'Olijfolie Sansa de Oliva 5ltr', 'ST'), -- Van Gelder: Olive oil
    ('f6f529f3-a57c-4dd8-9785-fb22dbe303d5', 'Van Gelder', '8713507232660', '8713507232660', '106638', 'Uien heel schoon 5 kg', 'ST'), -- Van Gelder: Onion peeled
    ('01e814d4-faaf-46d5-a2d7-7341faf3aa2a', 'Van Gelder', '8713507199536', '8713507199536', '142077', 'Bladpeterselie los', 'KST1KG'), -- Van Gelder: Parsley
    ('828c1743-853d-42a3-a65d-2d90a2edb014', 'Van Gelder', '8713507182545', '8713507182545', '166195', 'Granaatappelpitten los 1kg', 'ST'), -- Van Gelder: Pomegranate seeds
    ('84b927c9-3e61-4a0b-a333-40e07117452c', 'Van Gelder', '8713507203660', '8713507203660', NULL, 'Rode kool gesneden 2,5kg', NULL), -- Van Gelder: Red cabbage shredded
    ('877f4119-5911-4806-94bb-bb7256aaac6e', 'Van Gelder', '8713507042436', '8713507042436', '150002', 'Rode Linzen 500gr', 'ST'), -- Van Gelder: Red lentils
    ('b708181a-855e-4f0f-b6eb-09e99abda7e7', 'Van Gelder', '8713507249699', '8713507249699', '106649', 'Rode uien ringen fijn 2mm 1kg', 'KST12ST'), -- Van Gelder: Red onion sliced fine
    ('fe773dea-bda7-43f8-91d5-c50417c94ccb', 'Van Gelder', '8713507189872', '8713507189872', '130010', 'Romeinse sla', 'KST10ST'), -- Van Gelder: Romaine lettuce
    ('7250fd5c-f848-46f9-85d6-88f605705c61', 'Van Gelder', '8713507008630', '8713507008630', '100209', 'Tomaten A 47/57', 'KST6KG') -- Van Gelder: Tomato
)
INSERT INTO supplier_ingredients (
  supplier_id,
  raw_ingredient_id,
  supplier_sku,
  ean_code,
  supplier_article_code,
  supplier_article_name,
  order_unit
)
SELECT
  s.id,
  ri.id,
  rc.supplier_sku,
  rc.ean_code,
  rc.supplier_article_code,
  rc.supplier_article_name,
  rc.order_unit
FROM reviewed_codes rc
JOIN raw_ingredients ri ON ri.id = rc.raw_id::uuid
JOIN suppliers s
  ON s.location_id = ri.location_id
 AND lower(btrim(s.name)) = lower(btrim(rc.supplier_name))
ON CONFLICT (supplier_id, raw_ingredient_id) DO UPDATE
SET
  supplier_sku = EXCLUDED.supplier_sku,
  ean_code = EXCLUDED.ean_code,
  supplier_article_code = EXCLUDED.supplier_article_code,
  supplier_article_name = EXCLUDED.supplier_article_name,
  order_unit = EXCLUDED.order_unit,
  updated_at = NOW();

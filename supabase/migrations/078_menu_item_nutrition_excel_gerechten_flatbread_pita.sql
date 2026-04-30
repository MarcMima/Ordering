-- 078: Officiële portie-voeding uit Excel 260309_Voedingswaarde Mima.xlsx (tab Gerechten)
-- Afgeleid met scripts/mima_xlsx_parse.py + scripts/extract_gerechten_declared_nutrition.py
-- Waarden afgerond (kcal/macros geheel, zout 1 decimaal) — zie scripts/gerechten_declared_nutrition.json

INSERT INTO menu_item_nutrition (
  menu_item_id, kcal, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source
)
SELECT m.id, v.kcal, v.protein_g, v.carbs_g, v.sugar_g, v.fat_g, v.sat_fat_g, v.fiber_g, v.salt_g, v.source
FROM menu_items m
JOIN (
  VALUES
    ('flatbread chicken', 571::numeric, 55::numeric, 55::numeric, 11::numeric, 25::numeric, 9::numeric, 6::numeric, 7.7::numeric, 'mima_excel_260309_gerechten'::text),
    ('flatbread falafel', 696::numeric, 26::numeric, 70::numeric, 10::numeric, 39::numeric, 5::numeric, 15::numeric, 8.9::numeric, 'mima_excel_260309_gerechten'::text),
    ('flatbread sabich', 470::numeric, 23::numeric, 54::numeric, 10::numeric, 23::numeric, 4::numeric, 7::numeric, 7.3::numeric, 'mima_excel_260309_gerechten'::text),
    ('flatbread cauliflower', 531::numeric, 16::numeric, 63::numeric, 11::numeric, 27::numeric, 3::numeric, 11::numeric, 7.6::numeric, 'mima_excel_260309_gerechten'::text),
    ('pita chicken', 700::numeric, 60::numeric, 58::numeric, 10::numeric, 33::numeric, 10::numeric, 10::numeric, 8.6::numeric, 'mima_excel_260309_gerechten'::text),
    ('pita falafel', 750::numeric, 28::numeric, 72::numeric, 9::numeric, 39::numeric, 5::numeric, 17::numeric, 9.7::numeric, 'mima_excel_260309_gerechten'::text),
    ('pita sabich', 673::numeric, 27::numeric, 60::numeric, 13::numeric, 36::numeric, 6::numeric, 15::numeric, 9.3::numeric, 'mima_excel_260309_gerechten'::text),
    ('pita cauliflower', 659::numeric, 21::numeric, 65::numeric, 10::numeric, 36::numeric, 5::numeric, 14::numeric, 8.6::numeric, 'mima_excel_260309_gerechten'::text)
) AS v(slug, kcal, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
  ON lower(btrim(m.name)) = v.slug
ON CONFLICT (menu_item_id) DO UPDATE SET
  kcal = EXCLUDED.kcal,
  protein_g = EXCLUDED.protein_g,
  carbs_g = EXCLUDED.carbs_g,
  sugar_g = EXCLUDED.sugar_g,
  fat_g = EXCLUDED.fat_g,
  sat_fat_g = EXCLUDED.sat_fat_g,
  fiber_g = EXCLUDED.fiber_g,
  salt_g = EXCLUDED.salt_g,
  source = EXCLUDED.source,
  updated_at = NOW();

-- 070: Import voedingswaarden uit Grondstoffen sheet (Mima Excel 260309)
-- Alle waarden per 100 g/ml. Koppeling op naam (case-insensitive).
-- Run na 069. Idempotent: ON CONFLICT DO UPDATE.

DO $$
DECLARE
  rid UUID;
BEGIN

  -- Helper: voeg nutritional value in of update voor een gegeven grondstof naam
  -- Gebruik: zoek raw_ingredient op naam per locatie en voeg voedingswaarden in.
  -- We lopen over alle locaties zodat multi-locatie setups beide krijgen,
  -- maar UNIQUE constraint is op raw_ingredient_id zodat er altijd maar 1 rij is.

  -- ─── Groenten & vers ──────────────────────────────────────────────────────

  -- Aubergine / Eggplant (rauwe aubergine)
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Aubergine'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 20, 1, 3, 3, 0, 0, 1, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Carrot julienne
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Carrot julienne'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 34, 0.6, 5.6, 3.1, 0.3, 0.1, 3.3, 0.1, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Cauliflower (bloemkool)
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Cauliflower'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 20, 1.8, 1.7, 1.6, 0.5, 0, 1.8, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Celery brunoise
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Celery brunoise'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 14, 1, 2, 1, 0, 0, 1.1, 0.2, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Coriander (fresh) — koriander vers
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Coriander (fresh)'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 22, 2.1, 0.9, 0.9, 0.5, 0.01, 2.8, 0.13, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Coriander — kan ook de gedroogde/gemalen zijn; gebruik verse waarden als benadering
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Coriander'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 22, 2.1, 0.9, 0.9, 0.5, 0.01, 2.8, 0.13, 'Mima sheet 260309 (fresh)')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Cucumber
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Cucumber'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 13, 1, 1.3, 1.3, 0.4, 0.1, 0.6, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Garlic peeled
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Garlic peeled'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 140, 6, 28, 22, 0.5, 0, 0.9, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Garlic puree
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Garlic puree'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 81.5, 3.8, 15.1, 1.3, 0.6, 0.2, 0, 5.9, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Green chili
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Green chili'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 30, 1.8, 4.2, 4.2, 0.3, 0, 1.8, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Mango
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Mango'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 70, 0.8, 15, 13.7, 0.4, 0.1, 1.6, 0, 'Mima sheet 260309 (frozen)')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Mint (vers)
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Mint'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 49, 3.8, 5.1, 5.1, 0.7, 0.2, 3.5, 0.05, 'Mima sheet 260309 (fresh)')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Onion peeled (witte ui gepeld)
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Onion peeled'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 37, 1.2, 6.6, 5.1, 0.1, 0, 2.2, 0.0225, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Red cabbage shredded
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Red cabbage shredded'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 27, 2, 3, 3, 0, 0, 3.6, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Red onion sliced fine (rode ui)
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Red onion sliced fine'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 37, 1.3, 6.3, 4.5, 0.2, 0.1, 2.7, 0.0225, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Romaine lettuce
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Romaine lettuce'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 16, 1.3, 1.2, 1, 0.3, 0, 1.3, 0.03, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Parsley
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Parsley'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 30, 4, 1, 0, 0, 0, 5, 0.1, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Pomegranate seeds
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Pomegranate seeds'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 91, 1, 17, NULL, 1, 0, 3.4, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Tomato
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Tomato'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 23, 0.7, 3, 3, 0.5, 0.1, 1.4, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- ─── Proteïnen ────────────────────────────────────────────────────────────

  -- Chicken (kip dijbeenfilet)
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Chicken'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 155, 19, 0, 0, 8.7, 3.4, 0.5, 0.15, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Eggs
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Eggs'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 125, 12.2, 0, 0, 8.5, 2.8, 0, 0.38, 'Mima sheet 260309 / NEVO 1770')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Feta cheese
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Feta cheese'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 280, 16.2, 1, 0, 24.6, 17.9, 0, 2.5, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Greek yoghurt 10%
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Greek yoghurt 10%'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 121, 3.6, 4.1, 4.1, 10, 6.6, 0, 0.1, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Yoghurt (generiek)
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Yoghurt'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 121, 3.6, 4.1, 4.1, 10, 6.6, 0, 0.1, 'Mima sheet 260309 (Greek yoghurt)')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- ─── Peulvruchten & granen ─────────────────────────────────────────────────

  -- Chickpeas (droge kikkererwten, basis voor opweekberekening)
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Chickpeas'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 311, 20, 39, 3, 5.9, 0.8, 21.7, 0.1, 'Mima sheet 260309 (dried)')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Green lentils
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Green lentils'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 99, 8.8, 15.6, 0, 0.7, 0, 5.3, 9, 'Mima sheet 260309 / NEVO 970 (cooked)')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Red lentils
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Red lentils'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 306, 21, 43, 1, 1.5, 0.3, 18, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Bulgur
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Bulgur'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 341, 10.9, 66.3, 0.8, 1.6, 0.3, 8.9, 0.01, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Rice basmati (gebruik parboiled waarden als benadering)
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Rice basmati'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 355, 7.3, 79, 0.3, 0.8, 0.2, 1.5, 0.015, 'Mima sheet 260309 (parboiled)')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Rice pandan
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Rice pandan'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 365, 8.8, 78, 0.02, 2, 0.6, 0, 0.01, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- ─── Brood ────────────────────────────────────────────────────────────────

  -- Flatbread
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Flatbread'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 238, 8.2, 59.5, 4.48, 1.27, 0.3, 2.61, 0.8, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Pita bread 15 cm
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Pita bread 15 cm'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 221, 7.5, 43, 1.9, 1.2, 0.3, 4, 1.4, 'Mima sheet 260309 (Nina bakery)')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Whole wheat pita bread 15 cm (gebruik dezelfde waarden als witte pita als benadering)
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Whole wheat pita bread 15 cm'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 221, 7.5, 43, 1.9, 1.2, 0.3, 4, 1.4, 'Mima sheet 260309 (benadering witte pita)')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- All purpose flour
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('All purpose flour'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 350, 12, 71, 2.1, 1.5, 0.4, 2.1, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Rice flour
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Rice flour'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 355, 1, 87, 0, 0, 0, 0, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- ─── Oliën & vetten ──────────────────────────────────────────────────────

  -- Olive oil
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Olive oil'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 900, 0, 0, 0, 100, 12, 0, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Sunflower oil
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Sunflower oil'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 828, 0, 0, 0, 92, 11, 0, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Tahini
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Tahini'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 558, 24.4, 8.5, NULL, 62, 9.7, 9.16, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Flaxseed broken (gemalen lijnzaad)
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Flaxseed broken'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 530, 18, 1.6, 1.5, 42, 3.7, 27, 0.1, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- ─── Sauzen & conserven ──────────────────────────────────────────────────

  -- Lemon juice
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Lemon juice'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 23, 0.3, 1.1, 0.2, 0, 0.03, 0, 0.01, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Tomato puree
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Tomato puree'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 99, 5, 13.8, 13.4, 0.8, 0.2, 5, 0.04, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Vinegar
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Vinegar'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 13, 0.1, 0.1, 0.1, 0, 0, 0.1, 0.01, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Middle Eastern pickles
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Middle Eastern pickles'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 8.4, 0.8, 0.7, 0, 0, 0, 1.2, 2.7, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Kalamata olives
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Kalamata olives'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 115, 0.8, 6.3, 0, 11, 1.5, 3.2, 3.6, 'generiek / USDA benadering')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Shifka peppers (gebruik grilled aubergine waarden als geroosterde peper benadering)
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Shifka peppers'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 35, 0.8, 6.2, 3.2, 0.2, 0, 2.5, 1.1, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Stock
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Stock'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 244, 3.6, 33.7, 5.5, 10.2, 7, 1.5, 43.73, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- ─── Zoetstoffen & bakgrondstoffen ────────────────────────────────────────

  -- Sugar white
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Sugar white'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 400, 0, 100, 100, 0, 0, 0, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Sugar brown
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Sugar brown'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 396, 0, 99, 99, 0, 0, 0, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Cacao powder
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Cacao powder'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 360, 26, 27, 0.7, 11, 6.9, 25, 0.05, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Vanilla extract
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Vanilla extract'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 63, 0.1, 1.5, 0.4, 0, 0, 0, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Baking powder
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Baking powder'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 91, 0.1, 22, 0, 0.1, 0.1, 0, 22.1, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Baking soda
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Baking soda'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 0, 0, 0, 0, 0, 0, 0, 1, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Xantana
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Xantana'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 170, 0, 0, 0, 0, 0, 80, 7.6, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- ─── Kruiden & specerijen ──────────────────────────────────────────────────

  -- Za'atar
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Za''atar'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 246, 11, 25, 0, 28, 4.6, 30, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Salt
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Salt'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 0, 0, 0, 0, 0, 0, 0, 99.75, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Cumin
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Cumin'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 428, 17.8, 33.7, 0, 22.3, 1.5, 10.5, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Black pepper
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Black pepper'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 276, 10.4, 38.7, 0, 3.3, 1.4, 25.3, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Cardamom
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Cardamom'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 321, 10.8, 40.5, 0, 6.7, 0.7, 0, 0.1, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Chili powder
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Chili powder'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 388, 11.13, 54.46, 2, 9.88, 0.85, 18.37, 0.4, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Dried dill
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Dried dill'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 250, 8, 32, 15, 7, 1.3, 13.8, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Mustard powder
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Mustard powder'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 200, 26.1, 15.9, 0, 36.2, 2, 12.2, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Sumac
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Sumac'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 290, 4, 65, 5, 5, 1, 38, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Turmeric
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Turmeric'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 382, 9.7, 67.1, 0, 3.3, 1.8, 22.7, 0, 'Mima sheet 260309')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

  -- Rose petals
  FOR rid IN SELECT id FROM raw_ingredients WHERE lower(btrim(name)) = lower(btrim('Rose petals'))
  LOOP
    INSERT INTO ingredient_nutritional_values
      (raw_ingredient_id, kcal_per_100g, protein_g, carbs_g, sugar_g, fat_g, sat_fat_g, fiber_g, salt_g, source)
    VALUES (rid, 40, 1.5, 8, 4, 0.2, 0, 2, 0, 'benadering / geen data in sheet')
    ON CONFLICT (raw_ingredient_id) DO UPDATE SET
      kcal_per_100g=EXCLUDED.kcal_per_100g, protein_g=EXCLUDED.protein_g,
      carbs_g=EXCLUDED.carbs_g, sugar_g=EXCLUDED.sugar_g, fat_g=EXCLUDED.fat_g,
      sat_fat_g=EXCLUDED.sat_fat_g, fiber_g=EXCLUDED.fiber_g, salt_g=EXCLUDED.salt_g,
      updated_at=NOW();
  END LOOP;

END $$;

-- Rapportage
SELECT
  (SELECT count(*) FROM ingredient_nutritional_values) AS nutritional_rows_inserted,
  (SELECT count(*) FROM raw_ingredients r
    WHERE NOT EXISTS (SELECT 1 FROM ingredient_nutritional_values n WHERE n.raw_ingredient_id = r.id)
  ) AS raw_ingredients_without_nutritional_data;

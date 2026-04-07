-- Bulk import: prep_items.unit + content_amount + content_unit (per bottle/container/…)
--
-- GEBRUIK:
-- 1) Zorg dat migratie 017 gedraaid is (content_amount / content_unit kolommen).
-- 2) Vul hieronder je eigen INSERT INTO unit_rows … VALUES (…) regels in.
-- 3) Plak het hele bestand in Supabase SQL Editor en Run.
--
-- Matching: op prep_items.name (case-insensitive, trim). Meerdere rijen met dezelfde
-- naam in prep_items worden allemaal geüpdatet — houd namen uniek of gebruik Admin per id.
--
-- Kolommen staging:
--   prep_item_name  — exact zoals in prep_items (of zoals in receptenboek-bulk)
--   unit            — tel-eenheid: bottle, 1/2 GN container, bag, piece, …
--   content_amount  — hoeveelheid per 1 eenheid (bv. 750)
--   content_unit    — g, ml, kg
-- NULL in staging = veld op prep_items niet wijzigen.

-- =============================================================================
-- Kolommen bestaan (idempotent als 017 al gedraaid)
-- =============================================================================
ALTER TABLE prep_items
  ADD COLUMN IF NOT EXISTS content_amount NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS content_unit TEXT NULL;

-- =============================================================================
-- STAGING — pas de VALUES aan en run opnieuw (veilig meerdere keren)
-- =============================================================================
CREATE TEMP TABLE unit_rows (
  prep_item_name TEXT NOT NULL,
  unit TEXT,
  content_amount NUMERIC,
  content_unit TEXT
) ON COMMIT DROP;

-- Voorbeelden — vervang/uitbreiden met jouw lijst (namen moeten matchen met prep_items.name)
-- Voeg hier regels toe. Apostrof in naam: dubbel (''Za''atar ...'').
INSERT INTO unit_rows (prep_item_name, unit, content_amount, content_unit) VALUES
  ('Mudardara', 'GN 1/3', 3650, 'g'),
  ('Falafel', 'GN 1/2', 7100, 'g'),
  ('Aubergine / Sabich', 'GN 1/2', 2800, 'g'),
  ('Chicken marinade', 'GN 1/3', 5000, 'g'),
  ('Marinated chicken', 'GN 1/3', 5000, 'g'),
  ('Hummus', 'GN 1/3', 5150, 'g'),
  ('Babe ghanouj', 'Mezze cup', 210, 'g'),
  ('Tzatziki', 'GN 1/3', 5200, 'g'),
  ('Tarator', 'Bottle', 640, 'g'),
  ('Amba', 'Bottle', 640, 'g'),
  ('Srug', 'Bottle', 900, 'g'),
  ('Tahin brownie dough', 'Pieces', 95, 'g'),
  ('Pickled onion', 'GN 1/3', 3000, 'g'),
  ('Pickled cabbage', 'GN 1/3', 3000, 'g'),
  ('Feta', 'GN 1/6', 750, 'g'),
  ('Lettuce', 'GN 1/2', 2700, 'g'),
  ('Pomegranate', 'GN 1/6', 1000, 'g'),
  ('Mediterranean salad / Medi salad', 'GN 1/3', 3200, 'g'),
  ('Boiled eggs', 'GN 1/6', 30, 'pcs'),
  ('Za''atar flatbread chips', 'Bags', 100, 'g'),
  ('Lebanese lentil soup', 'GN 1/3', 4600, 'g'),
  ('Rose lemonade', 'Bottles', 500, 'g'),
  ('Turmeric rice', 'GN 1/3', 2800, 'g');

-- =============================================================================
-- UPDATE prep_items vanuit staging
-- =============================================================================
UPDATE prep_items p
SET
  unit = CASE
    WHEN u.unit IS NOT NULL AND btrim(u.unit) <> '' THEN btrim(u.unit)
    ELSE p.unit
  END,
  content_amount = COALESCE(u.content_amount, p.content_amount),
  content_unit = CASE
    WHEN u.content_unit IS NOT NULL AND btrim(u.content_unit) <> '' THEN btrim(u.content_unit)
    ELSE p.content_unit
  END,
  updated_at = NOW()
FROM unit_rows u
WHERE lower(btrim(p.name)) = lower(btrim(u.prep_item_name));

-- =============================================================================
-- Rapportage: welke staging rows matchten (en welke niet)
-- =============================================================================
SELECT
  (SELECT count(*) FROM unit_rows) AS staging_rows,
  (SELECT count(*) FROM unit_rows u WHERE EXISTS (
    SELECT 1 FROM prep_items p WHERE lower(btrim(p.name)) = lower(btrim(u.prep_item_name))
  )) AS matched_rows,
  (SELECT count(*) FROM unit_rows u WHERE NOT EXISTS (
    SELECT 1 FROM prep_items p WHERE lower(btrim(p.name)) = lower(btrim(u.prep_item_name))
  )) AS unmatched_rows;

-- Rows from your list that did NOT match any prep_items.name
SELECT u.*
FROM unit_rows u
WHERE NOT EXISTS (
  SELECT 1
  FROM prep_items p
  WHERE lower(btrim(p.name)) = lower(btrim(u.prep_item_name))
)
ORDER BY u.prep_item_name;

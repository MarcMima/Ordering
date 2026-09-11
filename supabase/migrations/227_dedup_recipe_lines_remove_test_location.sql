-- 227 — Model audit 11-09-2026 (D-01, D-02, R-09, M-01, N-06)
-- Applied to production 11-09-2026 in two parts (227a / 227b) via MCP; this file is the record.
-- * recipe lines: one line per (prep, ingredient name) — the canonical (Mima Amsterdam) copy is kept,
--   else the earliest; kept lines re-pointed to the canonical copy. Surplus lines are backed up in
--   audit_backup.prep_item_ingredients_20260911.
-- * "Mima TEST" removed (0 orders ever): 135 ingredient copies, 159 pack sizes, 143 price rows,
--   86 stock counts, 132 supplier mappings, 7 suppliers, 17 delivery schedules, 5 order channels,
--   31 prep links, 76 prep counts, 14 revenue targets, 2 drafts, 1 snapshot, 1 user access.
--   Ingredients, prices and the location row are backed up in audit_backup.*_test_20260911.
-- * Tabbouleh, Chicken marinade, Defrosted flatbread archived (hidden from stocktake, unlinked).
-- * Declared 260309 sheet values dropped from menu_item_nutrition (backed up).

CREATE SCHEMA IF NOT EXISTS audit_backup;

CREATE TABLE IF NOT EXISTS audit_backup.prep_item_ingredients_20260911 AS
  SELECT pii.*, now() AS backed_up_at FROM prep_item_ingredients pii WHERE false;

WITH ranked AS (
  SELECT pii.id,
         row_number() OVER (PARTITION BY pii.prep_item_id, lower(btrim(ri.name))
                            ORDER BY COALESCE(l.is_canonical,false) DESC, pii.created_at) AS rn
  FROM prep_item_ingredients pii
  JOIN raw_ingredients ri ON ri.id = pii.raw_ingredient_id
  LEFT JOIN locations l ON l.id = ri.location_id
)
INSERT INTO audit_backup.prep_item_ingredients_20260911
SELECT pii.*, now() FROM prep_item_ingredients pii WHERE pii.id IN (SELECT id FROM ranked WHERE rn > 1);

WITH ranked AS (
  SELECT pii.id,
         row_number() OVER (PARTITION BY pii.prep_item_id, lower(btrim(ri.name))
                            ORDER BY COALESCE(l.is_canonical,false) DESC, pii.created_at) AS rn
  FROM prep_item_ingredients pii
  JOIN raw_ingredients ri ON ri.id = pii.raw_ingredient_id
  LEFT JOIN locations l ON l.id = ri.location_id
)
DELETE FROM prep_item_ingredients WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

UPDATE prep_item_ingredients pii
SET raw_ingredient_id = c.id, updated_at = now()
FROM raw_ingredients s
JOIN locations sl ON sl.id = s.location_id
JOIN raw_ingredients c ON lower(btrim(c.name)) = lower(btrim(s.name))
JOIN locations cl ON cl.id = c.location_id AND cl.is_canonical
WHERE pii.raw_ingredient_id = s.id AND NOT sl.is_canonical;

UPDATE prep_items SET stocktake_visible = false, updated_at = now()
WHERE name IN ('Tabbouleh', 'Chicken marinade', 'Defrosted flatbread');
DELETE FROM location_prep_items WHERE prep_item_id IN (SELECT id FROM prep_items WHERE name IN ('Tabbouleh','Chicken marinade','Defrosted flatbread'));
DELETE FROM menu_item_components WHERE menu_item_id IN (SELECT id FROM menu_items WHERE name = 'Tabbouleh');
DELETE FROM menu_item_components WHERE prep_item_id IN (SELECT id FROM prep_items WHERE name IN ('Tabbouleh','Chicken marinade','Defrosted flatbread'));
UPDATE menu_items SET active = false, updated_at = now() WHERE name = 'Tabbouleh';

CREATE TABLE IF NOT EXISTS audit_backup.menu_item_nutrition_20260911 AS SELECT *, now() AS backed_up_at FROM menu_item_nutrition;
DELETE FROM menu_item_nutrition WHERE source = 'mima_excel_260309_gerechten';

-- Mima TEST (explicit, table by table)
CREATE TABLE IF NOT EXISTS audit_backup.raw_ingredients_test_20260911 AS
  SELECT r.* FROM raw_ingredients r JOIN locations l ON l.id = r.location_id WHERE l.name = 'Mima TEST';
CREATE TABLE IF NOT EXISTS audit_backup.ingredient_prices_test_20260911 AS
  SELECT p.* FROM ingredient_prices p WHERE p.raw_ingredient_id IN (SELECT id FROM audit_backup.raw_ingredients_test_20260911);
CREATE TABLE IF NOT EXISTS audit_backup.locations_test_20260911 AS
  SELECT * FROM locations WHERE name = 'Mima TEST';

DELETE FROM ingredient_pack_sizes   WHERE raw_ingredient_id IN (SELECT r.id FROM raw_ingredients r JOIN locations l ON l.id=r.location_id WHERE l.name='Mima TEST');
DELETE FROM ingredient_prices       WHERE raw_ingredient_id IN (SELECT r.id FROM raw_ingredients r JOIN locations l ON l.id=r.location_id WHERE l.name='Mima TEST');
DELETE FROM daily_stock_counts      WHERE location_id IN (SELECT id FROM locations WHERE name='Mima TEST');
DELETE FROM supplier_ingredients    WHERE raw_ingredient_id IN (SELECT r.id FROM raw_ingredients r JOIN locations l ON l.id=r.location_id WHERE l.name='Mima TEST');
DELETE FROM raw_ingredients         WHERE location_id IN (SELECT id FROM locations WHERE name='Mima TEST');
DELETE FROM supplier_delivery_schedules WHERE location_id IN (SELECT id FROM locations WHERE name='Mima TEST');
DELETE FROM supplier_order_channels     WHERE supplier_id IN (SELECT s.id FROM suppliers s JOIN locations l ON l.id=s.location_id WHERE l.name='Mima TEST');
DELETE FROM suppliers                   WHERE location_id IN (SELECT id FROM locations WHERE name='Mima TEST');
DELETE FROM location_prep_items         WHERE location_id IN (SELECT id FROM locations WHERE name='Mima TEST');
DELETE FROM daily_prep_counts           WHERE location_id IN (SELECT id FROM locations WHERE name='Mima TEST');
DELETE FROM daily_revenue_targets       WHERE location_id IN (SELECT id FROM locations WHERE name='Mima TEST');
DELETE FROM order_drafts                WHERE location_id IN (SELECT id FROM locations WHERE name='Mima TEST');
DELETE FROM order_suggestion_snapshots  WHERE location_id IN (SELECT id FROM locations WHERE name='Mima TEST');
DELETE FROM user_location_access        WHERE location_id IN (SELECT id FROM locations WHERE name='Mima TEST');
DELETE FROM locations WHERE name = 'Mima TEST';

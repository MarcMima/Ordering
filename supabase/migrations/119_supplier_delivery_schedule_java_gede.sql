-- Set explicit delivery schedules:
-- - Java bakery: Monday..Saturday
-- - GéDé: Tuesday + Friday
-- Tuana/Today Food Group remain on-demand (no fixed weekdays).

-- Java bakery
DELETE FROM supplier_delivery_schedules sds
USING suppliers s
WHERE sds.supplier_id = s.id
  AND lower(btrim(s.name)) = lower(btrim('Java bakery'));

INSERT INTO supplier_delivery_schedules (supplier_id, location_id, day_of_week)
SELECT
  s.id,
  s.location_id,
  d.day
FROM suppliers s
JOIN (VALUES (1),(2),(3),(4),(5),(6)) AS d(day) ON TRUE
WHERE lower(btrim(s.name)) = lower(btrim('Java bakery'))
ON CONFLICT DO NOTHING;

-- GéDé
DELETE FROM supplier_delivery_schedules sds
USING suppliers s
WHERE sds.supplier_id = s.id
  AND lower(btrim(s.name)) IN (lower(btrim('GéDé')), lower(btrim('Gede')), lower(btrim('Gede verpakkingen')));

INSERT INTO supplier_delivery_schedules (supplier_id, location_id, day_of_week)
SELECT
  s.id,
  s.location_id,
  d.day
FROM suppliers s
JOIN (VALUES (2),(5)) AS d(day) ON TRUE
WHERE lower(btrim(s.name)) IN (lower(btrim('GéDé')), lower(btrim('Gede')), lower(btrim('Gede verpakkingen')))
ON CONFLICT DO NOTHING;

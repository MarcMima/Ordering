-- Correct weekday indices for supplier_delivery_schedules:
-- schema stores 0=Monday ... 6=Sunday.
-- Java bakery should be Monday..Saturday; GéDé Tuesday + Friday.

-- Java bakery: 0..5
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
JOIN (VALUES (0),(1),(2),(3),(4),(5)) AS d(day) ON TRUE
WHERE lower(btrim(s.name)) = lower(btrim('Java bakery'))
ON CONFLICT DO NOTHING;

-- GéDé: Tuesday (1), Friday (4)
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
JOIN (VALUES (1),(4)) AS d(day) ON TRUE
WHERE lower(btrim(s.name)) IN (lower(btrim('GéDé')), lower(btrim('Gede')), lower(btrim('Gede verpakkingen')))
ON CONFLICT DO NOTHING;

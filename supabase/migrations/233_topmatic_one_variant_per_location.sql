-- Topmatic Hero vaatwasmiddel: één variant per locatie (Marc, 17 sept 2026).
--
-- "Topmatic Hero dishwasher detergent 12 kg" en "25 kg" stonden op alle drie de locaties
-- en werden allebei voorgesteld. Per locatie blijft er één over:
--   Mima Amsterdam → 12 kg  (telde 13-09: 12 kg = 24.000 g, 25 kg = 0)
--   Mima Pijp      → 25 kg  (telde 14-09: 12 kg = 4.800 g, 25 kg = 10.000 g; keuze Marc)
--   Mima Zuidas    → 25 kg  (nooit geteld)
-- De andere variant wordt gearchiveerd zoals in migratie 222: stocktake_visible = false
-- (uit telling, suggesties en selector). Niets verwijderd: tellingen, orderhistorie
-- (Amsterdam bestelde de 25 kg één keer), prijzen en leverancierskoppeling blijven.
-- Oude waarde: stocktake_visible = true op alle zes. Idempotent.

BEGIN;

UPDATE raw_ingredients r
SET stocktake_visible = false,
    updated_at        = now()
FROM locations l
WHERE l.id = r.location_id
  AND r.stocktake_visible IS DISTINCT FROM false
  AND (
       (l.name = 'Mima Amsterdam' AND r.name = 'Topmatic Hero dishwasher detergent 25 kg')
    OR (l.name = 'Mima Pijp'      AND r.name = 'Topmatic Hero dishwasher detergent 12 kg')
    OR (l.name = 'Mima Zuidas'    AND r.name = 'Topmatic Hero dishwasher detergent 12 kg')
  );

COMMIT;

-- Controle: per locatie precies één zichtbare Topmatic.
SELECT l.name AS locatie, r.name, r.stocktake_visible
FROM raw_ingredients r
JOIN locations l ON l.id = r.location_id
WHERE r.name LIKE 'Topmatic Hero dishwasher detergent%'
ORDER BY l.name, r.name;

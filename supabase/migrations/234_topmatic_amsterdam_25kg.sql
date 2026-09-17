-- Correctie op 233 (Marc, 17 sept 2026): ook West (Mima Amsterdam) houdt de 25 kg.
-- 233 hield in Amsterdam de 12 kg op basis van de telling van 13-09, maar Amsterdam
-- bestelde op 16-09 juist de 25 kg. Nu hebben alle drie de locaties de 25 kg.
-- Oude waarde na 233: 12 kg zichtbaar, 25 kg gearchiveerd. Niets verwijderd. Idempotent.

BEGIN;

UPDATE raw_ingredients r
SET stocktake_visible = (r.name = 'Topmatic Hero dishwasher detergent 25 kg'),
    updated_at        = now()
FROM locations l
WHERE l.id = r.location_id
  AND l.name = 'Mima Amsterdam'
  AND r.name IN ('Topmatic Hero dishwasher detergent 12 kg', 'Topmatic Hero dishwasher detergent 25 kg')
  AND r.stocktake_visible IS DISTINCT FROM (r.name = 'Topmatic Hero dishwasher detergent 25 kg');

COMMIT;

-- Controle: overal alleen de 25 kg zichtbaar.
SELECT l.name AS locatie, r.name, r.stocktake_visible
FROM raw_ingredients r
JOIN locations l ON l.id = r.location_id
WHERE r.name LIKE 'Topmatic Hero dishwasher detergent%'
ORDER BY l.name, r.name;

-- Unique index for upsert on haccp_ingangscontrole.
-- Dedupe-safe: removes duplicate rows (keep most-recent created_at, tie-break by id) before
-- creating the index, so this is safe to apply against a DB that already has duplicates.

-- 1. Delete duplicate rows for non-NULL line_slot.
DELETE FROM haccp_ingangscontrole
WHERE id NOT IN (
  SELECT DISTINCT ON (store_id, week_number, year, leverancier, line_slot)
    id
  FROM haccp_ingangscontrole
  WHERE line_slot IS NOT NULL
  ORDER BY store_id, week_number, year, leverancier, line_slot,
           created_at DESC NULLS LAST, id DESC
) AND line_slot IS NOT NULL;

-- 2. Delete duplicate rows for NULL line_slot (treat as one group per supplier/week).
DELETE FROM haccp_ingangscontrole
WHERE id NOT IN (
  SELECT DISTINCT ON (store_id, week_number, year, leverancier)
    id
  FROM haccp_ingangscontrole
  WHERE line_slot IS NULL
  ORDER BY store_id, week_number, year, leverancier,
           created_at DESC NULLS LAST, id DESC
) AND line_slot IS NULL;

-- 3. Create unique index (idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS uq_haccp_ingangscontrole_slot
  ON haccp_ingangscontrole (store_id, week_number, year, leverancier, line_slot);

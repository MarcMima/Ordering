-- Unique indexes for HACCP upsert on temperaturen and bereiden.
-- Dedupe-safe: removes duplicate rows before creating the index.
-- Both tables already have UNIQUE constraints in CREATE TABLE (migration 062),
-- but if those constraints are absent on the live DB this migration ensures the state is clean.

-- 1. Dedupe haccp_temperaturen (keep most-recent updated_at, tie-break by id).
DELETE FROM haccp_temperaturen
WHERE id NOT IN (
  SELECT DISTINCT ON (store_id, week_number, year)
    id
  FROM haccp_temperaturen
  ORDER BY store_id, week_number, year,
           updated_at DESC NULLS LAST, id DESC
);

-- 2. Dedupe haccp_bereiden.
DELETE FROM haccp_bereiden
WHERE id NOT IN (
  SELECT DISTINCT ON (store_id, week_number, year)
    id
  FROM haccp_bereiden
  ORDER BY store_id, week_number, year,
           updated_at DESC NULLS LAST, id DESC
);

-- 3. Create unique indexes (idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS uq_haccp_temperaturen_week
  ON haccp_temperaturen (store_id, week_number, year);

CREATE UNIQUE INDEX IF NOT EXISTS uq_haccp_bereiden_week
  ON haccp_bereiden (store_id, week_number, year);

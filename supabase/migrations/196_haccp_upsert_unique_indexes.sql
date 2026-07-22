-- Unique indexes for HACCP upsert (one row per store/week/year).
CREATE UNIQUE INDEX IF NOT EXISTS uq_haccp_temperaturen_week
  ON haccp_temperaturen (store_id, week_number, year);

CREATE UNIQUE INDEX IF NOT EXISTS uq_haccp_bereiden_week
  ON haccp_bereiden (store_id, week_number, year);

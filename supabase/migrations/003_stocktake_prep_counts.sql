-- Stocktake: prep item counts per location/date + category on prep_items
-- Run after 002_admin_fields.sql

ALTER TABLE prep_items
  ADD COLUMN IF NOT EXISTS category TEXT;

-- Counts for prep items by location and date (stocktake)
CREATE TABLE IF NOT EXISTS daily_prep_counts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  prep_item_id UUID NOT NULL REFERENCES prep_items(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, date, prep_item_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_prep_counts_location_date ON daily_prep_counts(location_id, date);

ALTER TABLE daily_prep_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated on daily_prep_counts"
  ON daily_prep_counts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow read write for anon on daily_prep_counts"
  ON daily_prep_counts FOR ALL TO anon USING (true) WITH CHECK (true);

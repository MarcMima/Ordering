-- Allow anon (unauthenticated) read/write for app pages that use the anon key
-- Required for: stocktake (location_prep_items, prep_items, daily_prep_counts, daily_revenue_targets)
-- Run after 003_stocktake_prep_counts.sql

-- Prep items: anon can read (for stocktake list)
CREATE POLICY "Allow read for anon on prep_items"
  ON prep_items FOR SELECT TO anon USING (true);

-- Location-prep links: anon can read (for stocktake list)
CREATE POLICY "Allow read for anon on location_prep_items"
  ON location_prep_items FOR SELECT TO anon USING (true);

-- Daily revenue targets: anon can read and write (stocktake expected revenue)
CREATE POLICY "Allow read for anon on daily_revenue_targets"
  ON daily_revenue_targets FOR SELECT TO anon USING (true);
CREATE POLICY "Allow insert for anon on daily_revenue_targets"
  ON daily_revenue_targets FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow update for anon on daily_revenue_targets"
  ON daily_revenue_targets FOR UPDATE TO anon USING (true) WITH CHECK (true);

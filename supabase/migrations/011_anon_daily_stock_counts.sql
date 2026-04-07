-- Stocktake grondstoffen: anon mag daily_stock_counts lezen en schrijven.
DROP POLICY IF EXISTS "Allow read for anon on daily_stock_counts" ON daily_stock_counts;
DROP POLICY IF EXISTS "Allow insert for anon on daily_stock_counts" ON daily_stock_counts;
DROP POLICY IF EXISTS "Allow update for anon on daily_stock_counts" ON daily_stock_counts;
CREATE POLICY "Allow read for anon on daily_stock_counts"
  ON daily_stock_counts FOR SELECT TO anon USING (true);
CREATE POLICY "Allow insert for anon on daily_stock_counts"
  ON daily_stock_counts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow update for anon on daily_stock_counts"
  ON daily_stock_counts FOR UPDATE TO anon USING (true) WITH CHECK (true);

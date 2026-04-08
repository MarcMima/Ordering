-- Logged-in users (authenticated) need the same access as anon on tables that only had anon policies.

DROP POLICY IF EXISTS "Allow all for authenticated on prep_item_ingredients" ON prep_item_ingredients;
CREATE POLICY "Allow all for authenticated on prep_item_ingredients"
  ON prep_item_ingredients FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated on supplier_ingredients" ON supplier_ingredients;
CREATE POLICY "Allow all for authenticated on supplier_ingredients"
  ON supplier_ingredients FOR ALL TO authenticated USING (true) WITH CHECK (true);

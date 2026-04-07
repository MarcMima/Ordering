-- Admin: anon can insert/update/delete raw_ingredients and ingredient_pack_sizes (for Ingredients section)

DROP POLICY IF EXISTS "Allow insert for anon on raw_ingredients" ON raw_ingredients;
DROP POLICY IF EXISTS "Allow update for anon on raw_ingredients" ON raw_ingredients;
DROP POLICY IF EXISTS "Allow delete for anon on raw_ingredients" ON raw_ingredients;
CREATE POLICY "Allow insert for anon on raw_ingredients"
  ON raw_ingredients FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow update for anon on raw_ingredients"
  ON raw_ingredients FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for anon on raw_ingredients"
  ON raw_ingredients FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Allow insert for anon on ingredient_pack_sizes" ON ingredient_pack_sizes;
DROP POLICY IF EXISTS "Allow update for anon on ingredient_pack_sizes" ON ingredient_pack_sizes;
DROP POLICY IF EXISTS "Allow delete for anon on ingredient_pack_sizes" ON ingredient_pack_sizes;
CREATE POLICY "Allow insert for anon on ingredient_pack_sizes"
  ON ingredient_pack_sizes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow update for anon on ingredient_pack_sizes"
  ON ingredient_pack_sizes FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for anon on ingredient_pack_sizes"
  ON ingredient_pack_sizes FOR DELETE TO anon USING (true);

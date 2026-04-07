-- Stocktake (and Admin) updates display_order on location_prep_items; anon client had no UPDATE policy.

DROP POLICY IF EXISTS "Allow update for anon on location_prep_items" ON location_prep_items;
CREATE POLICY "Allow update for anon on location_prep_items"
  ON location_prep_items FOR UPDATE TO anon USING (true) WITH CHECK (true);

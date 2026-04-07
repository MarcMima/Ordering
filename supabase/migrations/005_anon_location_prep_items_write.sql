-- Allow anon to add/remove location–product links (Admin → Locations → Manage products)
-- Run after 004_anon_read_stocktake.sql

CREATE POLICY "Allow insert for anon on location_prep_items"
  ON location_prep_items FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow delete for anon on location_prep_items"
  ON location_prep_items FOR DELETE TO anon USING (true);

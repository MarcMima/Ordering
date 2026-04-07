-- Ordering screen: anon read suppliers, delivery schedules, ingredients, pack sizes; anon insert orders + order_line_items

-- Suppliers and delivery schedules (read)
DROP POLICY IF EXISTS "Allow read for anon on suppliers" ON suppliers;
CREATE POLICY "Allow read for anon on suppliers"
  ON suppliers FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow read for anon on supplier_delivery_schedules" ON supplier_delivery_schedules;
CREATE POLICY "Allow read for anon on supplier_delivery_schedules"
  ON supplier_delivery_schedules FOR SELECT TO anon USING (true);

-- Raw ingredients and pack sizes (read)
DROP POLICY IF EXISTS "Allow read for anon on raw_ingredients" ON raw_ingredients;
CREATE POLICY "Allow read for anon on raw_ingredients"
  ON raw_ingredients FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow read for anon on ingredient_pack_sizes" ON ingredient_pack_sizes;
CREATE POLICY "Allow read for anon on ingredient_pack_sizes"
  ON ingredient_pack_sizes FOR SELECT TO anon USING (true);

-- Orders: anon can insert and read (for ordering screen)
DROP POLICY IF EXISTS "Allow read for anon on orders" ON orders;
CREATE POLICY "Allow read for anon on orders"
  ON orders FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Allow insert for anon on orders" ON orders;
CREATE POLICY "Allow insert for anon on orders"
  ON orders FOR INSERT TO anon WITH CHECK (true);

-- Order line items: anon can insert and read
DROP POLICY IF EXISTS "Allow read for anon on order_line_items" ON order_line_items;
CREATE POLICY "Allow read for anon on order_line_items"
  ON order_line_items FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "Allow insert for anon on order_line_items" ON order_line_items;
CREATE POLICY "Allow insert for anon on order_line_items"
  ON order_line_items FOR INSERT TO anon WITH CHECK (true);

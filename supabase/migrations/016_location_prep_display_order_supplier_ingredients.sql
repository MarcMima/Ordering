-- 016: Kitchen flow sort order + map raw ingredients to suppliers
--
-- 1) display_order on location_prep_items — lower = earlier in Stocktake / Prep list
-- 2) supplier_ingredients — which raw ingredients belong on which supplier's order list

-- -----------------------------------------------------------------------------
-- A) Sort order for finished products per location
-- -----------------------------------------------------------------------------
ALTER TABLE location_prep_items
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_location_prep_items_display_order
  ON location_prep_items(location_id, display_order);

COMMENT ON COLUMN location_prep_items.display_order IS
  'Kitchen flow order; lower appears first. App should ORDER BY display_order, then prep item name.';

-- -----------------------------------------------------------------------------
-- B) Supplier ↔ raw ingredient mapping (order lists)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  raw_ingredient_id UUID NOT NULL REFERENCES raw_ingredients(id) ON DELETE CASCADE,
  supplier_sku TEXT,
  is_preferred BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_id, raw_ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_ingredients_supplier
  ON supplier_ingredients(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ingredients_raw
  ON supplier_ingredients(raw_ingredient_id);

ALTER TABLE supplier_ingredients ENABLE ROW LEVEL SECURITY;

-- Match other anon policies: read/write for in-app Admin + Ordering
DROP POLICY IF EXISTS "Allow read for anon on supplier_ingredients" ON supplier_ingredients;
DROP POLICY IF EXISTS "Allow insert for anon on supplier_ingredients" ON supplier_ingredients;
DROP POLICY IF EXISTS "Allow update for anon on supplier_ingredients" ON supplier_ingredients;
DROP POLICY IF EXISTS "Allow delete for anon on supplier_ingredients" ON supplier_ingredients;

CREATE POLICY "Allow read for anon on supplier_ingredients"
  ON supplier_ingredients FOR SELECT TO anon USING (true);
CREATE POLICY "Allow insert for anon on supplier_ingredients"
  ON supplier_ingredients FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow update for anon on supplier_ingredients"
  ON supplier_ingredients FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete for anon on supplier_ingredients"
  ON supplier_ingredients FOR DELETE TO anon USING (true);

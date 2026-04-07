-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Locations (root entity, no location_id)
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_locations_name ON locations(name);

-- Suppliers (scoped to location)
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_info TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_suppliers_location_id ON suppliers(location_id);

-- Supplier delivery schedules
CREATE TABLE supplier_delivery_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  delivery_window TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_supplier_delivery_schedules_supplier_id ON supplier_delivery_schedules(supplier_id);
CREATE INDEX idx_supplier_delivery_schedules_location_id ON supplier_delivery_schedules(location_id);

-- Raw ingredients (scoped to location)
CREATE TABLE raw_ingredients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_raw_ingredients_location_id ON raw_ingredients(location_id);

-- Ingredient pack sizes
CREATE TABLE ingredient_pack_sizes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  raw_ingredient_id UUID NOT NULL REFERENCES raw_ingredients(id) ON DELETE CASCADE,
  size NUMERIC NOT NULL,
  size_unit TEXT NOT NULL,
  price_cents INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ingredient_pack_sizes_raw_ingredient_id ON ingredient_pack_sizes(raw_ingredient_id);

-- Prep items (global templates)
CREATE TABLE prep_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  unit TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prep_items_name ON prep_items(name);

-- Location prep items (links location to prep item)
CREATE TABLE location_prep_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  prep_item_id UUID NOT NULL REFERENCES prep_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, prep_item_id)
);

CREATE INDEX idx_location_prep_items_location_id ON location_prep_items(location_id);
CREATE INDEX idx_location_prep_items_prep_item_id ON location_prep_items(prep_item_id);

-- Recipes (scoped to location)
CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recipes_location_id ON recipes(location_id);

-- Daily stock counts
CREATE TABLE daily_stock_counts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  raw_ingredient_id UUID NOT NULL REFERENCES raw_ingredients(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, date, raw_ingredient_id)
);

CREATE INDEX idx_daily_stock_counts_location_date ON daily_stock_counts(location_id, date);

-- Daily revenue targets
CREATE TABLE daily_revenue_targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  target_amount_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, date)
);

CREATE INDEX idx_daily_revenue_targets_location_date ON daily_revenue_targets(location_id, date);

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  order_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'delivered', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_location_id ON orders(location_id);
CREATE INDEX idx_orders_order_date ON orders(order_date);
CREATE INDEX idx_orders_status ON orders(status);

-- Order line items
CREATE TABLE order_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  raw_ingredient_id UUID NOT NULL REFERENCES raw_ingredients(id) ON DELETE RESTRICT,
  pack_size_id UUID REFERENCES ingredient_pack_sizes(id) ON DELETE SET NULL,
  quantity NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_line_items_order_id ON order_line_items(order_id);

-- Row Level Security: enable on all tables
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_delivery_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_pack_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE prep_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_prep_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_revenue_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_line_items ENABLE ROW LEVEL SECURITY;

-- RLS policies: allow authenticated users full access (adjust for your auth model)
CREATE POLICY "Allow all for authenticated users on locations"
  ON locations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users on suppliers"
  ON suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users on supplier_delivery_schedules"
  ON supplier_delivery_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users on raw_ingredients"
  ON raw_ingredients FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users on ingredient_pack_sizes"
  ON ingredient_pack_sizes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users on prep_items"
  ON prep_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users on location_prep_items"
  ON location_prep_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users on recipes"
  ON recipes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users on daily_stock_counts"
  ON daily_stock_counts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users on daily_revenue_targets"
  ON daily_revenue_targets FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users on orders"
  ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users on order_line_items"
  ON order_line_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Optional: allow anon for local dev (remove in production)
CREATE POLICY "Allow read for anon on locations"
  ON locations FOR SELECT TO anon USING (true);

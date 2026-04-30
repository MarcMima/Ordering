-- 069: Voedingswaarden per grondstof + menukaart structuur
-- Fundament voor: voedingsinfo per gerecht, theoretisch verbruik vs stocktake, food cost berekeningen
-- Volgorde: run ná 068 (haccp_leveranciers_multi_docs)

-- ─── 1. Voedingswaarden per grondstof ──────────────────────────────────────────
-- Waarden per 100 g/ml (conform Grondstoffen sheet)
CREATE TABLE IF NOT EXISTS ingredient_nutritional_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_ingredient_id UUID NOT NULL REFERENCES raw_ingredients(id) ON DELETE CASCADE,
  kcal_per_100g NUMERIC,
  protein_g NUMERIC,
  carbs_g NUMERIC,
  sugar_g NUMERIC,
  fat_g NUMERIC,
  sat_fat_g NUMERIC,
  fiber_g NUMERIC,
  salt_g NUMERIC,
  source TEXT,           -- bijv. 'NEVO', 'product label', 'Mima calculated'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(raw_ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_ingredient_nutritional_values_raw
  ON ingredient_nutritional_values(raw_ingredient_id);

COMMENT ON TABLE ingredient_nutritional_values IS
  'Voedingswaarden per 100 g/ml grondstof. Bron: Grondstoffen sheet (Mima) of externe databases (NEVO, Open Food Facts).';

-- ─── 2. Prep item voedingswaarden ──────────────────────────────────────────────
-- Berekend vanuit recepten + grondstoffen; opgeslagen voor snelle weergave.
-- Wordt geüpdated wanneer recepten of grondstoffen wijzigen.
CREATE TABLE IF NOT EXISTS prep_item_nutritional_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prep_item_id UUID NOT NULL REFERENCES prep_items(id) ON DELETE CASCADE,
  -- Per 1 telt-eenheid (zelfde als prep_items.unit / content_amount)
  kcal NUMERIC,
  protein_g NUMERIC,
  carbs_g NUMERIC,
  sugar_g NUMERIC,
  fat_g NUMERIC,
  sat_fat_g NUMERIC,
  fiber_g NUMERIC,
  salt_g NUMERIC,
  -- Per 100 g (voor weergave op menukaart / allergenen)
  kcal_per_100g NUMERIC,
  protein_per_100g NUMERIC,
  carbs_per_100g NUMERIC,
  sugar_per_100g NUMERIC,
  fat_per_100g NUMERIC,
  sat_fat_per_100g NUMERIC,
  fiber_per_100g NUMERIC,
  salt_per_100g NUMERIC,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(prep_item_id)
);

-- ─── 3. Menu items (de gerechten op de kaart) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,    -- 'flatbread' | 'pita' | 'bowl' | 'mezze' | 'side' | 'drink'
  subcategory TEXT,          -- bijv. 'chicken', 'falafel', 'sabich', 'cauliflower'
  price_cents INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  sides_product_id TEXT,     -- koppeling met Sides POS systeem
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category);
CREATE INDEX IF NOT EXISTS idx_menu_items_active   ON menu_items(active);

-- Idempotent imports (071): one row per dish name
CREATE UNIQUE INDEX IF NOT EXISTS menu_items_name_ci ON menu_items ((lower(btrim(name))));

COMMENT ON COLUMN menu_items.sides_product_id IS
  'Product ID in Sides POS — koppelt daily_sales aan menu_items voor theoretisch verbruik.';

-- ─── 4. Menu item componenten (wat zit er in een gerecht) ──────────────────────
-- Één rij per component. Ofwel een prep item (Hummus, Falafel) ofwel een grondstof (Pita, Ei).
CREATE TABLE IF NOT EXISTS menu_item_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  prep_item_id UUID REFERENCES prep_items(id) ON DELETE SET NULL,
  raw_ingredient_id UUID REFERENCES raw_ingredients(id) ON DELETE SET NULL,
  quantity_grams NUMERIC NOT NULL,
  portion_label TEXT,        -- bijv. '1 spoon', '1 scoop', '4 pcs'
  display_order INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT menu_item_component_has_source
    CHECK (prep_item_id IS NOT NULL OR raw_ingredient_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_menu_item_components_menu
  ON menu_item_components(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_components_prep
  ON menu_item_components(prep_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_components_raw
  ON menu_item_components(raw_ingredient_id);

COMMENT ON TABLE menu_item_components IS
  'Wat gaat er in een gerecht. Koppelt menu_items aan prep_items (afgewerkte producten) of raw_ingredients (rechtstreekse grondstoffen zoals pita of ei). quantity_grams is de portiegrootte per verkocht gerecht.';

-- ─── 5. Dagverkopen (Sides API) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  menu_item_name TEXT,       -- denorm: naam op moment van verkoop (backup als sides_product_id wijzigt)
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  revenue_cents INTEGER NOT NULL DEFAULT 0,
  channel TEXT,              -- 'dine_in' | 'takeaway' | 'delivery' | null
  sides_order_id TEXT,       -- referentie naar Sides order
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, date, menu_item_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_daily_sales_location_date
  ON daily_sales(location_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_sales_menu_item
  ON daily_sales(menu_item_id);

-- ─── 6. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE ingredient_nutritional_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE prep_item_nutritional_values  ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_components          ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_sales                   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingr_nutritional_all" ON ingredient_nutritional_values
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "prep_nutritional_all" ON prep_item_nutritional_values
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "menu_items_all" ON menu_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "menu_item_components_all" ON menu_item_components
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "daily_sales_all" ON daily_sales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon: lees menukaart + voedingswaarden (nodig voor frontend weergave)
CREATE POLICY "ingr_nutritional_anon_read" ON ingredient_nutritional_values
  FOR SELECT TO anon USING (true);
CREATE POLICY "menu_items_anon_read" ON menu_items
  FOR SELECT TO anon USING (true);
CREATE POLICY "menu_item_components_anon_read" ON menu_item_components
  FOR SELECT TO anon USING (true);

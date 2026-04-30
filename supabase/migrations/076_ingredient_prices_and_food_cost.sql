-- 076: Prijshistorie per ingredient + food cost berekening
-- Run na 075 (allergenen).
--
-- Model:
--   ingredient_prices  — prijs per pack op een bepaalde datum, per leverancier
--   ingredient_price_history  — view: alle prijswijzigingen per ingredient
--   food_cost_snapshots — optioneel: opgeslagen kostprijs per menu item per datum
--
-- Kostprijs per gerecht wordt runtime berekend vanuit:
--   menu_item_components → prep_item_ingredients → ingredient_prices
--   (prijs per gram = pack_price / pack_size_grams)
--
-- Let op: calculate_menu_item_cost dekt geen bowl_base_option_id-regels (073+);
--         bowls: uitbreiden in een latere migratie indien nodig.

-- ─── 1. Prijshistorie per grondstof ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingredient_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_ingredient_id UUID NOT NULL REFERENCES raw_ingredients(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  pack_size_grams NUMERIC NOT NULL,
  pack_size_label TEXT,
  price_cents INTEGER NOT NULL,
  price_includes_vat BOOLEAN NOT NULL DEFAULT false,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL DEFAULT 'manual',
  source_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingredient_prices_ingredient
  ON ingredient_prices(raw_ingredient_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_ingredient_prices_supplier
  ON ingredient_prices(supplier_id, effective_date DESC);

COMMENT ON TABLE ingredient_prices IS
  'Prijshistorie per grondstof per leverancier. Elke rij is een prijs die geldig is vanaf effective_date.';

-- ─── 2. View: actuele prijs per grondstof ────────────────────────────────────
CREATE OR REPLACE VIEW ingredient_current_prices AS
SELECT DISTINCT ON (ip.raw_ingredient_id, ip.supplier_id)
  ip.*,
  ri.name AS ingredient_name,
  ri.unit AS ingredient_unit,
  s.name  AS supplier_name,
  ROUND((ip.price_cents::NUMERIC / NULLIF(ip.pack_size_grams, 0)), 4) AS price_cents_per_gram
FROM ingredient_prices ip
JOIN raw_ingredients ri ON ri.id = ip.raw_ingredient_id
LEFT JOIN suppliers s   ON s.id  = ip.supplier_id
ORDER BY ip.raw_ingredient_id, ip.supplier_id, ip.effective_date DESC;

COMMENT ON VIEW ingredient_current_prices IS
  'Meest recente prijs per grondstof per leverancier, inclusief prijs-per-gram.';

-- ─── 3. View: prijswijzigingen ───────────────────────────────────────────────
CREATE OR REPLACE VIEW ingredient_price_trend AS
SELECT
  ip.raw_ingredient_id,
  ri.name                                             AS ingredient_name,
  ip.supplier_id,
  s.name                                              AS supplier_name,
  ip.effective_date,
  ip.price_cents,
  ip.pack_size_grams,
  ROUND((ip.price_cents::NUMERIC / NULLIF(ip.pack_size_grams, 0)), 4) AS price_cents_per_gram,
  ip.source,
  LAG(ip.price_cents) OVER (
    PARTITION BY ip.raw_ingredient_id, ip.supplier_id
    ORDER BY ip.effective_date
  )                                                   AS prev_price_cents,
  ROUND(
    100.0 * (ip.price_cents - LAG(ip.price_cents) OVER (
      PARTITION BY ip.raw_ingredient_id, ip.supplier_id
      ORDER BY ip.effective_date
    )) / NULLIF(LAG(ip.price_cents) OVER (
      PARTITION BY ip.raw_ingredient_id, ip.supplier_id
      ORDER BY ip.effective_date
    ), 0),
    2
  )                                                   AS price_change_pct
FROM ingredient_prices ip
JOIN raw_ingredients ri ON ri.id = ip.raw_ingredient_id
LEFT JOIN suppliers s   ON s.id  = ip.supplier_id
ORDER BY ip.raw_ingredient_id, ip.effective_date DESC;

-- ─── 4. Food cost snapshots ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS food_cost_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cost_cents NUMERIC,
  price_cents INTEGER,
  food_cost_pct NUMERIC,
  calculation_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_food_cost_snapshots_item_date
  ON food_cost_snapshots(menu_item_id, snapshot_date DESC);

-- ─── 5. Scraper job log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scraper_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  run_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL,
  prices_updated INTEGER DEFAULT 0,
  prices_unchanged INTEGER DEFAULT 0,
  errors JSONB,
  duration_ms INTEGER,
  source_url TEXT
);

-- ─── 6. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE ingredient_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_cost_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ingredient_prices_all" ON ingredient_prices;
CREATE POLICY "ingredient_prices_all" ON ingredient_prices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "food_cost_snapshots_all" ON food_cost_snapshots;
CREATE POLICY "food_cost_snapshots_all" ON food_cost_snapshots
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "scraper_runs_all" ON scraper_runs;
CREATE POLICY "scraper_runs_all" ON scraper_runs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ingredient_prices_anon_read" ON ingredient_prices;
DROP POLICY IF EXISTS "ingredient_prices_anon_all" ON ingredient_prices;
CREATE POLICY "ingredient_prices_anon_all" ON ingredient_prices
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "scraper_runs_anon_read" ON scraper_runs;
CREATE POLICY "scraper_runs_anon_read" ON scraper_runs
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "food_cost_snapshots_anon_all" ON food_cost_snapshots;
CREATE POLICY "food_cost_snapshots_anon_all" ON food_cost_snapshots
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─── 7. Helper: kostprijs per menu item ──────────────────────────────────────
CREATE OR REPLACE FUNCTION calculate_menu_item_cost(p_menu_item_id UUID)
RETURNS TABLE (
  menu_item_id UUID,
  component_name TEXT,
  ingredient_name TEXT,
  quantity_grams NUMERIC,
  price_cents_per_gram NUMERIC,
  line_cost_cents NUMERIC
) LANGUAGE sql STABLE AS $$
  SELECT
    mic.menu_item_id,
    'direct: ' || ri.name        AS component_name,
    ri.name                       AS ingredient_name,
    mic.quantity_grams,
    icp.price_cents_per_gram,
    ROUND(mic.quantity_grams * icp.price_cents_per_gram, 2) AS line_cost_cents
  FROM menu_item_components mic
  JOIN raw_ingredients ri ON ri.id = mic.raw_ingredient_id
  LEFT JOIN (
    SELECT DISTINCT ON (raw_ingredient_id)
      raw_ingredient_id, price_cents_per_gram
    FROM ingredient_current_prices
    ORDER BY raw_ingredient_id, effective_date DESC
  ) icp ON icp.raw_ingredient_id = ri.id
  WHERE mic.menu_item_id = p_menu_item_id
    AND mic.raw_ingredient_id IS NOT NULL
    AND mic.option_group IS NULL

  UNION ALL

  SELECT
    mic.menu_item_id,
    pi.name                       AS component_name,
    ri.name                       AS ingredient_name,
    ROUND(
      pii.quantity_per_unit
      * mic.quantity_grams
      / NULLIF(pi.content_amount, 0),
      4
    )                             AS quantity_grams,
    icp.price_cents_per_gram,
    ROUND(
      pii.quantity_per_unit
      * mic.quantity_grams
      / NULLIF(pi.content_amount, 0)
      * icp.price_cents_per_gram,
      2
    )                             AS line_cost_cents
  FROM menu_item_components mic
  JOIN prep_items pi ON pi.id = mic.prep_item_id
  JOIN prep_item_ingredients pii ON pii.prep_item_id = pi.id
  JOIN raw_ingredients ri ON ri.id = pii.raw_ingredient_id
  LEFT JOIN (
    SELECT DISTINCT ON (raw_ingredient_id)
      raw_ingredient_id, price_cents_per_gram
    FROM ingredient_current_prices
    ORDER BY raw_ingredient_id, effective_date DESC
  ) icp ON icp.raw_ingredient_id = ri.id
  WHERE mic.menu_item_id = p_menu_item_id
    AND mic.prep_item_id IS NOT NULL
    AND mic.option_group IS NULL
$$;

COMMENT ON FUNCTION calculate_menu_item_cost IS
  'Theoretische kostprijs per component. SUM(line_cost_cents) = totaal. Vereist prep_items.content_amount. Geen bowl_base_option_id.';

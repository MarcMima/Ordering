-- Ordering & stock-par overrides op raw_ingredients (vervangt hardcoded constanten).
-- Per-locatie overrides gaan in raw_ingredient_location_ordering.
-- Beide tafels vallen onder de config-lockdown (anon read-only, schrijven via service-role API).

-- 1. Kolommen op raw_ingredients
ALTER TABLE raw_ingredients
  ADD COLUMN IF NOT EXISTS ordering_daily_need_multiplier  NUMERIC,
  ADD COLUMN IF NOT EXISTS ordering_min_order_packs        NUMERIC,
  ADD COLUMN IF NOT EXISTS ordering_max_order_base         NUMERIC,
  ADD COLUMN IF NOT EXISTS ordering_min_order_base         NUMERIC,
  ADD COLUMN IF NOT EXISTS stock_par_kind                  TEXT CHECK (stock_par_kind IN ('base','packs')),
  ADD COLUMN IF NOT EXISTS stock_par_min_amount            NUMERIC,
  ADD COLUMN IF NOT EXISTS stock_par_min_packs             NUMERIC,
  ADD COLUMN IF NOT EXISTS stock_par_order_packs           NUMERIC;

COMMENT ON COLUMN raw_ingredients.ordering_daily_need_multiplier IS
  'Globale kalibratievermenigvuldiger op dagbehoefte (vóór cover-window math). NULL = 1.';
COMMENT ON COLUMN raw_ingredients.ordering_min_order_packs IS
  'Minimaal dit aantal packs voordat een bestelregel wordt gegenereerd. NULL = >0.';
COMMENT ON COLUMN raw_ingredients.ordering_max_order_base IS
  'Maximum bestelhoeveelheid per levering in basiseenheden (g/ml/pcs). NULL = geen cap.';
COMMENT ON COLUMN raw_ingredients.ordering_min_order_base IS
  'Minimum bestelhoeveelheid in basiseenheden wanneer er al een regel is. NULL = geen floor.';
COMMENT ON COLUMN raw_ingredients.stock_par_kind IS
  'Stock-par-type: ''base'' (vaste hoeveelheid) of ''packs'' (aantal packs).';
COMMENT ON COLUMN raw_ingredients.stock_par_min_amount IS
  'Voor kind=base: streefhoeveelheid in basiseenheden. NULL = geen par.';
COMMENT ON COLUMN raw_ingredients.stock_par_min_packs IS
  'Voor kind=packs: minimaal dit aantal packs op voorraad (mag decimaal, bijv. 0.5).';
COMMENT ON COLUMN raw_ingredients.stock_par_order_packs IS
  'Voor kind=packs: bestel dit aantal packs wanneer par wordt geraakt (MOQ). NULL = shortfall.';

-- 2. Per-locatie ordering overrides
CREATE TABLE IF NOT EXISTS raw_ingredient_location_ordering (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_ingredient_id      UUID NOT NULL REFERENCES raw_ingredients(id) ON DELETE CASCADE,
  location_id            UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  daily_need_multiplier  NUMERIC,
  standing_order_packs   INTEGER,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (raw_ingredient_id, location_id)
);

COMMENT ON TABLE raw_ingredient_location_ordering IS
  'Per-locatie ordering-overrides (multiplier, staande bestelminimum). Config-tabel.';

CREATE INDEX IF NOT EXISTS idx_rilo_location ON raw_ingredient_location_ordering (location_id);

ALTER TABLE raw_ingredient_location_ordering ENABLE ROW LEVEL SECURITY;

-- Config: anon read-only (schrijven via service-role API-route)
DROP POLICY IF EXISTS rilo_anon_read ON raw_ingredient_location_ordering;
CREATE POLICY rilo_anon_read ON raw_ingredient_location_ordering FOR SELECT TO anon USING (true);

-- 3. raw_ingredients zit al in de lockdown van migratie 194 (kitchen_anon_read policy).
--    De nieuwe kolommen vallen hier automatisch onder — geen extra stap nodig.

-- Bidfood weekly assortment sync (Type 03 artikelbericht).

ALTER TABLE supplier_ingredients
  ADD COLUMN IF NOT EXISTS bf_last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bf_is_active BOOLEAN,
  ADD COLUMN IF NOT EXISTS bf_last_status TEXT,
  ADD COLUMN IF NOT EXISTS bf_replacement_article_code TEXT;

COMMENT ON COLUMN supplier_ingredients.bf_last_checked_at IS
  'Last Bidfood assortment file sync for this mapping.';
COMMENT ON COLUMN supplier_ingredients.bf_is_active IS
  'Bidfood Voorraadcode: false when uit assortiment (code 2).';
COMMENT ON COLUMN supplier_ingredients.bf_last_status IS
  'Human-readable status from last assortment sync.';
COMMENT ON COLUMN supplier_ingredients.bf_replacement_article_code IS
  'Suggested/auto-applied replacement artikelnummer from Bidfood file.';

CREATE TABLE IF NOT EXISTS bidfood_assortment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  file_name TEXT,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  rows_in_file INTEGER,
  mappings_checked INTEGER NOT NULL DEFAULT 0,
  mappings_updated INTEGER NOT NULL DEFAULT 0,
  auto_replaced INTEGER NOT NULL DEFAULT 0,
  inactive INTEGER NOT NULL DEFAULT 0,
  not_in_file INTEGER NOT NULL DEFAULT 0,
  report_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bidfood_assortment_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bidfood_assortment_runs_read" ON bidfood_assortment_runs
  FOR SELECT TO authenticated USING (true);

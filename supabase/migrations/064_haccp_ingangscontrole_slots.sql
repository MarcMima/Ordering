-- Goods in: optional use-by date + stable line slot per supplier/week

ALTER TABLE haccp_ingangscontrole
  ADD COLUMN IF NOT EXISTS use_by_date DATE;

ALTER TABLE haccp_ingangscontrole
  ADD COLUMN IF NOT EXISTS line_slot SMALLINT;

COMMENT ON COLUMN haccp_ingangscontrole.line_slot IS '0–4: row index within supplier block (Bidfood / Van Gelder).';
COMMENT ON COLUMN haccp_ingangscontrole.use_by_date IS 'Product use-by date when recorded.';

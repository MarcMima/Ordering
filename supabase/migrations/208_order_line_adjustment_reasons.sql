-- Correctie-capture: leg per orderregel vast wat het systeem adviseerde en waarom de
-- manager daarvan afweek. Het verschil tussen suggested_base_qty en de bestelde
-- hoeveelheid is het leersignaal; een lege adjustment_reason betekent "geen incidentele
-- reden bekend" en telt daarmee juist mee als structureel signaal.

ALTER TABLE order_line_items
  ADD COLUMN IF NOT EXISTS suggested_base_qty NUMERIC,
  ADD COLUMN IF NOT EXISTS adjustment_reason  TEXT,
  ADD COLUMN IF NOT EXISTS adjustment_note    TEXT;

-- suggested_base_qty is een eigenschap van de grondstof, niet van de regel: als één
-- grondstof over meerdere regels wordt besteld (bv. peterselie in dozen én zakken)
-- staat op elke regel dezelfde waarde. Bij analyse per (order, grondstof) dus niet
-- optellen maar de eerste waarde nemen.

ALTER TABLE order_line_items
  DROP CONSTRAINT IF EXISTS order_line_items_adjustment_reason_check;
ALTER TABLE order_line_items
  ADD CONSTRAINT order_line_items_adjustment_reason_check
  CHECK (adjustment_reason IS NULL OR adjustment_reason IN (
    'promo', 'event', 'weather', 'delivery_issue', 'other'
  ));

-- Patroondetectie leest per grondstof de laatste bestelmomenten.
CREATE INDEX IF NOT EXISTS idx_order_line_items_raw_adjustment
  ON order_line_items (raw_ingredient_id)
  WHERE suggested_base_qty IS NOT NULL;

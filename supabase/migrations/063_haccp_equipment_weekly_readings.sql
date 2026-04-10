-- Per-store HACCP equipment list + weekly temperature readings (JSONB)

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS haccp_store_id INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN locations.haccp_store_id IS
  'Shared HACCP equipment / temperature rows for locations that use the same kitchen profile.';

CREATE TABLE IF NOT EXISTS haccp_store_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  norm_display TEXT NOT NULL,
  norm_kind TEXT NOT NULL CHECK (norm_kind IN ('lte', 'gte')),
  norm_value NUMERIC NOT NULL,
  show_fifo BOOLEAN NOT NULL DEFAULT FALSE,
  show_exact_temp BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_haccp_store_equipment_store
  ON haccp_store_equipment (store_id, sort_order);

ALTER TABLE haccp_temperaturen
  ADD COLUMN IF NOT EXISTS weekly_check_dow INTEGER
    CHECK (weekly_check_dow IS NULL OR (weekly_check_dow >= 1 AND weekly_check_dow <= 7));

ALTER TABLE haccp_temperaturen
  ADD COLUMN IF NOT EXISTS weekly_readings JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN haccp_temperaturen.weekly_check_dow IS 'Day of check: 1=Mon … 7=Sun (ISO weekday).';
COMMENT ON COLUMN haccp_temperaturen.weekly_readings IS
  'Array of {equipment_id, temperature, exact_temperature?, fifo_ok?, clean_ok?, corrective_action?, signature?}.';

ALTER TABLE haccp_store_equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "haccp_store_equipment_all" ON haccp_store_equipment;
CREATE POLICY "haccp_store_equipment_all" ON haccp_store_equipment
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Default list for store_id = 1 (edit via Admin or copy rows for other store_id values)
INSERT INTO haccp_store_equipment (store_id, sort_order, label, norm_display, norm_kind, norm_value, show_fifo, show_exact_temp)
SELECT 1, x.sort_order, x.label, x.norm_display, x.norm_kind, x.norm_value, x.show_fifo, x.show_exact_temp
FROM (VALUES
  (10, 'Refrigerator cold line 1', 'Max 7°C', 'lte', 7::numeric, true, true),
  (20, 'Refrigerator cold line 2', 'Max 7°C', 'lte', 7::numeric, true, true),
  (30, 'Work bench refrigerator (aubergine & cauliflower)', 'Max 7°C', 'lte', 7::numeric, true, true),
  (40, 'Work bench refrigerator (chicken & falafel)', 'Max 7°C', 'lte', 7::numeric, true, true),
  (50, 'Refrigerator fresh produce (right)', 'Max 7°C', 'lte', 7::numeric, true, true),
  (60, 'Refrigerator finished produce (middle)', 'Max 7°C', 'lte', 7::numeric, true, true),
  (70, 'Refrigerator finished produce (left)', 'Max 7°C', 'lte', 7::numeric, true, true),
  (80, 'Freezer (left)', '≤ −18°C', 'lte', -18::numeric, true, true),
  (90, 'Dishwasher', '> 55°C', 'gte', 55::numeric, false, true),
  (100, 'Dishwasher last 10 seconds of program', '> 80°C', 'gte', 80::numeric, false, true),
  (110, 'Alto Shaam / Hotbox', '> 60°C', 'gte', 60::numeric, false, true),
  (120, 'Hot line mujadara', '> 60°C', 'gte', 60::numeric, false, true),
  (130, 'Hot line main', '> 60°C', 'gte', 60::numeric, false, true),
  (140, 'Fryer 1 (left)', '≤ 175°C', 'lte', 175::numeric, false, true),
  (150, 'Fryer 2 (middle)', '≤ 175°C', 'lte', 175::numeric, false, true),
  (160, 'Fryer 3 (right)', '≤ 175°C', 'lte', 175::numeric, false, true)
) AS x(sort_order, label, norm_display, norm_kind, norm_value, show_fifo, show_exact_temp)
WHERE NOT EXISTS (
  SELECT 1 FROM haccp_store_equipment e WHERE e.store_id = 1 AND e.label = x.label
);

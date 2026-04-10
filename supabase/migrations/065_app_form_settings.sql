-- Toggle which HACCP (and related) forms appear in the app

CREATE TABLE IF NOT EXISTS app_form_settings (
  form_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_form_settings (form_key, label, visible) VALUES
  ('haccp_temperatures', 'HACCP — Temperatures', TRUE),
  ('haccp_goods_in', 'HACCP — Goods in', TRUE),
  ('haccp_cleaning', 'HACCP — Cleaning', TRUE),
  ('haccp_thermometers', 'HACCP — Thermometer test', TRUE),
  ('haccp_prepare', 'HACCP — Prepare & serve (placeholder)', TRUE),
  ('haccp_suppliers', 'HACCP — Suppliers (placeholder)', TRUE)
ON CONFLICT (form_key) DO NOTHING;

ALTER TABLE app_form_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_form_settings_all" ON app_form_settings;
CREATE POLICY "app_form_settings_all" ON app_form_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

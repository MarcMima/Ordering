-- 202: Kanaalinstellingen (BTW / commissie / waste) + verkoopprijzen per kanaal
-- Bron: kostprijsproject fase 2 (Excel 251126_Menu.xlsx, besluiten Marc 24-08-2026).
-- Additief; seed met ON CONFLICT DO NOTHING zodat latere handmatige wijzigingen blijven staan.

CREATE TABLE IF NOT EXISTS channel_settings (
  channel TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  vat_rate_food NUMERIC NOT NULL DEFAULT 9,
  vat_rate_alcohol NUMERIC NOT NULL DEFAULT 21,
  commission_pct NUMERIC NOT NULL DEFAULT 0,   -- % van online prijs incl. BTW
  waste_pct NUMERIC NOT NULL DEFAULT 10,       -- opslag op theoretische kostprijs
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE channel_settings IS
  'Verkoopkanalen met BTW-tarieven, platformcommissie en waste-opslag. Vervangt de magic numbers uit het Excel-kostprijsmodel (L1/P1/X1). Blend per kanaal later o.b.v. verkoopdata (Butlaroo).';

INSERT INTO channel_settings (channel, display_name, commission_pct, waste_pct, notes) VALUES
  ('instore',      'Instore',       0, 10, NULL),
  ('uber_eats',    'Uber Eats',    28, 10, 'Commissie over online prijs incl. BTW'),
  ('thuisbezorgd', 'Thuisbezorgd', 21, 10, 'Commissie over online prijs incl. BTW')
ON CONFLICT (channel) DO NOTHING;

CREATE TABLE IF NOT EXISTS menu_item_channel_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  channel TEXT NOT NULL REFERENCES channel_settings(channel),
  price_cents INTEGER NOT NULL,
  price_includes_vat BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (menu_item_id, channel)
);

COMMENT ON TABLE menu_item_channel_prices IS
  'Verkoopprijs per kanaal (incl. BTW). menu_items.price_cents blijft de instore prijs.';

ALTER TABLE channel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_channel_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_settings_anon_read ON channel_settings;
CREATE POLICY channel_settings_anon_read ON channel_settings FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS channel_settings_auth_all ON channel_settings;
CREATE POLICY channel_settings_auth_all ON channel_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS micp_anon_read ON menu_item_channel_prices;
CREATE POLICY micp_anon_read ON menu_item_channel_prices FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS micp_auth_all ON menu_item_channel_prices;
CREATE POLICY micp_auth_all ON menu_item_channel_prices FOR ALL TO authenticated USING (true) WITH CHECK (true);

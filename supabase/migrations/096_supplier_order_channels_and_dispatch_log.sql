-- Supplier ordering channels + dispatch audit log.
-- Required by supabase/functions/dispatch-order.

CREATE TABLE IF NOT EXISTS supplier_order_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL UNIQUE REFERENCES suppliers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('van_gelder_api', 'bidfood_api', 'email', 'whatsapp')),
  api_base_url TEXT,
  api_customer_code TEXT,
  email_to TEXT,
  email_cc TEXT,
  email_subject_template TEXT,
  whatsapp_phone TEXT,
  whatsapp_use_api BOOLEAN NOT NULL DEFAULT false,
  auto_send BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_order_channels_supplier_id
  ON supplier_order_channels(supplier_id);

CREATE TABLE IF NOT EXISTS order_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  sent_by TEXT,
  dispatched_at TIMESTAMPTZ,
  supplier_order_number TEXT,
  response_raw JSONB,
  error_message TEXT,
  message_body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_dispatches_order_id
  ON order_dispatches(order_id);
CREATE INDEX IF NOT EXISTS idx_order_dispatches_supplier_id
  ON order_dispatches(supplier_id);
CREATE INDEX IF NOT EXISTS idx_order_dispatches_status
  ON order_dispatches(status);

ALTER TABLE supplier_order_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_order_channels_all ON supplier_order_channels;
CREATE POLICY supplier_order_channels_all
  ON supplier_order_channels
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS order_dispatches_all ON order_dispatches;
CREATE POLICY order_dispatches_all
  ON order_dispatches
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed/maintain Bidfood channel config per location.
WITH bidfood_map(location_name, customer_code) AS (
  VALUES
    ('Mima Amsterdam', '074380'),
    ('Mima Pijp', '076970'),
    ('Mima Zuidas', '080840')
)
INSERT INTO supplier_order_channels (
  supplier_id,
  channel,
  api_base_url,
  api_customer_code,
  auto_send
)
SELECT
  s.id,
  'bidfood_api',
  'https://bas.bidfood.nl',
  bm.customer_code,
  false
FROM suppliers s
JOIN locations l ON l.id = s.location_id
JOIN bidfood_map bm ON bm.location_name = l.name
WHERE lower(btrim(s.name)) = 'bidfood'
ON CONFLICT (supplier_id) DO UPDATE
SET
  channel = EXCLUDED.channel,
  api_base_url = EXCLUDED.api_base_url,
  api_customer_code = EXCLUDED.api_customer_code,
  updated_at = NOW();

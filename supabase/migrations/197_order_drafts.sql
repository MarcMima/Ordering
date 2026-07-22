-- Operationele tabel: bestel-concept opslaan per locatie per dag.
-- Anon krijgt volledige lees- en schrijfrechten (zelfde patroon als daily_stock_counts).
-- NIET opnemen in de config-lockdown van migratie 194.

CREATE TABLE IF NOT EXISTS order_drafts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id  UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  overrides    JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (location_id, date)
);

CREATE INDEX IF NOT EXISTS idx_order_drafts_location_date
  ON order_drafts (location_id, date);

ALTER TABLE order_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_drafts_anon_all ON order_drafts;
CREATE POLICY order_drafts_anon_all ON order_drafts FOR ALL TO anon USING (true) WITH CHECK (true);

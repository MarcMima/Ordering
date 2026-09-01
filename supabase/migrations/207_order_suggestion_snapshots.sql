-- Operationele tabel: de berekende bestelsuggestie per locatie per dag vastleggen,
-- zodat achteraf te zien is wat de app adviseerde (en waarom) naast wat er besteld is.
-- Anon krijgt volledige lees- en schrijfrechten (zelfde patroon als daily_stock_counts
-- en order_drafts). NIET opnemen in de config-lockdown van migratie 194.

CREATE TABLE IF NOT EXISTS order_suggestion_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id  UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lines        JSONB NOT NULL DEFAULT '[]',
  UNIQUE (location_id, date)
);

CREATE INDEX IF NOT EXISTS idx_order_suggestion_snapshots_location_date
  ON order_suggestion_snapshots (location_id, date);

ALTER TABLE order_suggestion_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_suggestion_snapshots_anon_all ON order_suggestion_snapshots;
CREATE POLICY order_suggestion_snapshots_anon_all ON order_suggestion_snapshots
  FOR ALL TO anon USING (true) WITH CHECK (true);

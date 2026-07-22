-- Unique index for upsert on haccp_ingangscontrole (atomic save).
CREATE UNIQUE INDEX IF NOT EXISTS uq_haccp_ingangscontrole_slot
  ON haccp_ingangscontrole (store_id, week_number, year, leverancier, line_slot);

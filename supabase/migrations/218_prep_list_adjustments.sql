-- Keuken-aanpassingen op de dagelijkse preplist (WhatsApp Jan Pieter Heijestraat, 3 sept 2026):
-- de chef wil per dag een taak kunnen toevoegen, de te maken hoeveelheid overschrijven
-- (model zegt "Make 1", keuken maakt 3) en taken schrappen die vandaag niet nodig zijn.
-- Geldt alleen voor die locatie + datum; het rekenmodel (location_prep_items) blijft intact.

CREATE TABLE IF NOT EXISTS prep_list_adjustments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  -- Bestaand prep item (override/remove/add van een verborgen item) ...
  prep_item_id  UUID REFERENCES prep_items(id) ON DELETE CASCADE,
  -- ... of een vrije taak die niet als prep item bestaat.
  custom_name   TEXT,
  custom_unit   TEXT,
  -- NULL = berekende hoeveelheid gebruiken.
  make_override NUMERIC(10,2) CHECK (make_override IS NULL OR make_override >= 0),
  removed       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prep_list_adjustments_target CHECK (
    (prep_item_id IS NOT NULL AND custom_name IS NULL)
    OR (prep_item_id IS NULL AND custom_name IS NOT NULL AND length(trim(custom_name)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS prep_list_adjustments_item_uniq
  ON prep_list_adjustments (location_id, date, prep_item_id)
  WHERE prep_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prep_list_adjustments_loc_date
  ON prep_list_adjustments (location_id, date);

ALTER TABLE prep_list_adjustments ENABLE ROW LEVEL SECURITY;

-- Zelfde model als daily_prep_counts: keuken-tablets (anon) mogen alles,
-- ingelogde gebruikers lezen per locatie en beheren met operations.manage.
DROP POLICY IF EXISTS kitchen_anon_all ON prep_list_adjustments;
CREATE POLICY kitchen_anon_all ON prep_list_adjustments
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS prep_list_adjustments_select ON prep_list_adjustments;
CREATE POLICY prep_list_adjustments_select ON prep_list_adjustments
  FOR SELECT TO authenticated USING (public.has_location_access(location_id));

DROP POLICY IF EXISTS prep_list_adjustments_manage ON prep_list_adjustments;
CREATE POLICY prep_list_adjustments_manage ON prep_list_adjustments
  FOR ALL TO authenticated
  USING (public.has_permission('operations.manage') AND public.has_location_access(location_id))
  WITH CHECK (public.has_permission('operations.manage') AND public.has_location_access(location_id));

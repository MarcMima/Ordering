-- Algemeen feedbackkanaal vanuit de app: managers melden een probleem of idee vanaf
-- de pagina waar ze staan. Operationele tabel, los van de correctie-capture in 208:
-- dit gaat over de app zelf, niet over een bestelregel.

CREATE TABLE IF NOT EXISTS app_feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  page        TEXT,
  type        TEXT NOT NULL CHECK (type IN ('probleem', 'idee', 'anders')),
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_feedback_created_at ON app_feedback (created_at DESC);

ALTER TABLE app_feedback ENABLE ROW LEVEL SECURITY;

-- Alleen invoegen: feedback is een logboek, geen bewerkbare lijst. Er is bewust geen
-- UPDATE- of DELETE-policy, ook niet voor authenticated. Uitlezen gebeurt door de
-- wekelijkse loop via de service-role.
DROP POLICY IF EXISTS app_feedback_anon_insert ON app_feedback;
CREATE POLICY app_feedback_anon_insert ON app_feedback
  FOR INSERT TO anon WITH CHECK (true);

-- Productie draait met logins; zonder deze policy zou RLS elke inzending weigeren.
DROP POLICY IF EXISTS app_feedback_insert_authenticated ON app_feedback;
CREATE POLICY app_feedback_insert_authenticated ON app_feedback
  FOR INSERT TO authenticated
  WITH CHECK (location_id IS NULL OR public.has_location_access(location_id));

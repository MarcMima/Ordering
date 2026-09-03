-- Vervolg op 218 (Marc, 3 sept 2026): de keuken geeft bij elke aanpassing een reden op,
-- en het systeem leert ervan via de manager: bij structurele afwijkingen biedt de app een
-- nieuwe basishoeveelheid aan die de manager in de app accepteert of afwijst.

ALTER TABLE prep_list_adjustments
  ADD COLUMN IF NOT EXISTS reason TEXT
    CHECK (reason IS NULL OR reason IN ('event', 'model_wrong', 'stock_wrong', 'other')),
  ADD COLUMN IF NOT EXISTS reason_note TEXT,
  -- Snapshot van het model op het moment van de wijziging; nodig om een nieuwe
  -- basishoeveelheid af te leiden zonder de dag te hoeven herberekenen.
  ADD COLUMN IF NOT EXISTS model_make NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS model_needed NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS stock_at_edit NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS revenue_multiplier NUMERIC(10,4);

-- Beslissingen van de manager over voorgestelde basishoeveelheden. Een afgewezen voorstel
-- komt pas terug als er ná de beslissing opnieuw genoeg afwijkingen zijn.
CREATE TABLE IF NOT EXISTS prep_base_suggestion_decisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  prep_item_id    UUID NOT NULL REFERENCES prep_items(id) ON DELETE CASCADE,
  old_base        NUMERIC(10,2),
  suggested_base  NUMERIC(10,2) NOT NULL,
  decision        TEXT NOT NULL CHECK (decision IN ('accepted', 'dismissed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prep_base_suggestion_decisions_loc
  ON prep_base_suggestion_decisions (location_id, prep_item_id, created_at DESC);

ALTER TABLE prep_base_suggestion_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kitchen_anon_read ON prep_base_suggestion_decisions;
CREATE POLICY kitchen_anon_read ON prep_base_suggestion_decisions
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS prep_base_suggestion_decisions_select ON prep_base_suggestion_decisions;
CREATE POLICY prep_base_suggestion_decisions_select ON prep_base_suggestion_decisions
  FOR SELECT TO authenticated USING (public.has_location_access(location_id));

-- Schrijven gaat uitsluitend via de functie hieronder, zodat de wijziging van
-- location_prep_items.base_quantity en de beslissing altijd samen worden vastgelegd.
CREATE OR REPLACE FUNCTION public.decide_prep_base_suggestion(
  p_location_prep_item_id UUID,
  p_suggested_base NUMERIC,
  p_decision TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row location_prep_items%ROWTYPE;
BEGIN
  IF p_decision NOT IN ('accepted', 'dismissed') THEN
    RAISE EXCEPTION 'invalid decision %', p_decision;
  END IF;
  IF p_suggested_base IS NULL OR p_suggested_base < 0 THEN
    RAISE EXCEPTION 'invalid suggested base';
  END IF;
  SELECT * INTO v_row FROM location_prep_items WHERE id = p_location_prep_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'location_prep_item % not found', p_location_prep_item_id;
  END IF;

  INSERT INTO prep_base_suggestion_decisions (location_id, prep_item_id, old_base, suggested_base, decision)
  VALUES (v_row.location_id, v_row.prep_item_id, v_row.base_quantity, p_suggested_base, p_decision);

  IF p_decision = 'accepted' THEN
    UPDATE location_prep_items
      SET base_quantity = p_suggested_base, updated_at = NOW()
      WHERE id = p_location_prep_item_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_prep_base_suggestion(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_prep_base_suggestion(UUID, NUMERIC, TEXT) TO anon, authenticated;

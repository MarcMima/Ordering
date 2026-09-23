-- Engine review 21 sept 2026 — twee schemawijzigingen.
--
-- 1. raw_ingredients.stock_par_mode
--    Een stock par was tot nu toe altijd "par-managed": op/boven par verdwijnt de regel
--    (ook de behoefte-suggestie), onder par alleen het tekort. Voor receptgedreven producten
--    waar de weekloop een par op zet (aubergine, mint, granaatappel, rode ui, …) is dat niet de
--    bedoeling: daar is de par een ondergrens náást de behoefte. 'floor' = max(behoefte, par-order)
--    en de par overleeft de productgates (mint-prep, Sabich-containers).
--    NULL / 'replace' = het oude gedrag, dus deze migratie verandert op zichzelf niets.
--
-- 2. Log van location_prep_items.base_quantity
--    base_quantity stuurt de prep list én de dagbehoefte van de bestelsuggestie. Op 18/19-09 zijn
--    bij Amsterdam negen waarden aangepast zonder spoor, terwijl de weekloop multipliers afstelt
--    op dezelfde producten. Vanaf nu schrijft een trigger elke wijziging naar parameter_changes
--    (source 'prep-list-edit'), zodat de maandaganalyse ze meeleest.
--    parameter_changes bestaat in productie sinds 08-09 (via de connector aangemaakt).
--
-- Idempotent.

BEGIN;

ALTER TABLE raw_ingredients
  ADD COLUMN IF NOT EXISTS stock_par_mode text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'raw_ingredients_stock_par_mode_check'
  ) THEN
    ALTER TABLE raw_ingredients
      ADD CONSTRAINT raw_ingredients_stock_par_mode_check
      CHECK (stock_par_mode IS NULL OR stock_par_mode IN ('replace', 'floor'));
  END IF;
END $$;

COMMENT ON COLUMN raw_ingredients.stock_par_mode IS
  'NULL/replace = par-managed only (line dropped at/above par, shortfall below). floor = par is a minimum next to the need-based suggestion and survives product gates.';

ALTER TABLE parameter_changes
  ADD COLUMN IF NOT EXISTS prep_item_id uuid REFERENCES prep_items(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION log_location_prep_base_quantity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  who text;
BEGIN
  IF NEW.base_quantity IS NOT DISTINCT FROM OLD.base_quantity THEN
    RETURN NEW;
  END IF;
  BEGIN
    who := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
  EXCEPTION WHEN others THEN
    who := NULL;
  END;
  INSERT INTO parameter_changes (prep_item_id, location_id, field, old_value, new_value, source, approved_by, note)
  VALUES (
    NEW.prep_item_id,
    NEW.location_id,
    'location_prep_items.base_quantity',
    COALESCE(OLD.base_quantity::text, 'NULL'),
    COALESCE(NEW.base_quantity::text, 'NULL'),
    'prep-list-edit',
    COALESCE(who, current_user),
    'Automatic log (trigger). Drives both the prep list and the ordering daily need.'
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_location_prep_base_quantity ON location_prep_items;
CREATE TRIGGER trg_log_location_prep_base_quantity
  AFTER UPDATE OF base_quantity ON location_prep_items
  FOR EACH ROW EXECUTE FUNCTION log_location_prep_base_quantity_change();

COMMIT;

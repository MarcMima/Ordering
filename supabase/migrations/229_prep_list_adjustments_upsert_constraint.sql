-- Preplist-edits werden nooit opgeslagen (melding Jan Pieter Heijestraat, 11 sept 2026:
-- "de knoppen van prep list lijken niet te werken").
--
-- Oorzaak: migratie 218 maakte de uniciteit per locatie + datum + prep item als PARTIËLE
-- index (WHERE prep_item_id IS NOT NULL). De app slaat Make-overrides en Remove op met
-- upsert(onConflict: "location_id,date,prep_item_id"). PostgREST stuurt daarvoor
-- ON CONFLICT (location_id, date, prep_item_id) zonder WHERE-predicaat, en Postgres kan
-- dat niet op een partiële index matchen:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- Elke klik gaf een 400; prep_list_adjustments bevatte sinds 3 sept nul rijen.
--
-- Oplossing: een gewone unieke constraint op dezelfde kolommen. Semantisch gelijk aan de
-- oude index: NULL's tellen in Postgres als verschillend, dus vrije taken (prep_item_id
-- NULL) mogen nog steeds meerdere keren per dag. Droog getest in een teruggedraaide
-- transactie (upsert override -> upsert removed -> twee custom tasks). Tabel was leeg,
-- dus geen risico op bestaande dubbelingen.

BEGIN;

DROP INDEX IF EXISTS prep_list_adjustments_item_uniq;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.prep_list_adjustments'::regclass
      AND conname = 'prep_list_adjustments_item_uniq'
  ) THEN
    ALTER TABLE prep_list_adjustments
      ADD CONSTRAINT prep_list_adjustments_item_uniq UNIQUE (location_id, date, prep_item_id);
  END IF;
END $$;

COMMIT;

-- Controle: moet één rij 'u' (unique) teruggeven.
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.prep_list_adjustments'::regclass
  AND conname = 'prep_list_adjustments_item_uniq';

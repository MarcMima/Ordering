-- Track Van Gelder catalog sync status per mapped supplier ingredient.

ALTER TABLE supplier_ingredients
  ADD COLUMN IF NOT EXISTS vg_last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vg_is_active BOOLEAN,
  ADD COLUMN IF NOT EXISTS vg_last_status TEXT;

COMMENT ON COLUMN supplier_ingredients.vg_last_checked_at IS
  'Laatste keer dat Van Gelder articles-check is uitgevoerd voor deze mapping.';
COMMENT ON COLUMN supplier_ingredients.vg_is_active IS
  'Resultaat van laatste Van Gelder articles-check: artikel actief (true) of inactief/fout (false).';
COMMENT ON COLUMN supplier_ingredients.vg_last_status IS
  'Laatste status/reden van Van Gelder check (bijv. HTTP status of inactief melding).';

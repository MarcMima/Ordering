-- 129: Re-sync full operational setup from West/Amsterdam source to Zuidas.
-- Uses existing sync_location_setup() to align raws, packs, schedules, suppliers,
-- and supplier_ingredients mappings so ordering suggestions have complete inputs.

DO $$
DECLARE
  src_name TEXT;
  tgt_name TEXT := 'Mima Zuidas';
BEGIN
  -- Prefer explicit West names; fallback to Amsterdam if that's the "West" source in this project.
  SELECT name
  INTO src_name
  FROM locations
  WHERE lower(btrim(name)) IN (
    'mima west',
    'west',
    'mima amsterdam west',
    'mima amsterdam',
    'amsterdam'
  )
    AND lower(btrim(name)) <> lower(btrim(tgt_name))
  ORDER BY
    CASE
      WHEN lower(btrim(name)) IN ('mima west', 'west', 'mima amsterdam west') THEN 1
      WHEN lower(btrim(name)) IN ('mima amsterdam', 'amsterdam') THEN 2
      ELSE 3
    END,
    name
  LIMIT 1;

  IF src_name IS NULL THEN
    RAISE EXCEPTION 'No suitable West/Amsterdam source location found for Zuidas sync.';
  END IF;

  PERFORM public.sync_location_setup(src_name, tgt_name);
END $$;

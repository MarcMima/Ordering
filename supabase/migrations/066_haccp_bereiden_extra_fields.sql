-- Optional fields from paper form (time of first cooling reading, regenerate duration)

ALTER TABLE haccp_bereiden
  ADD COLUMN IF NOT EXISTS terugkoelen_tijd_begin TEXT;

ALTER TABLE haccp_bereiden
  ADD COLUMN IF NOT EXISTS regenereer_tijd_minuten NUMERIC;

COMMENT ON COLUMN haccp_bereiden.terugkoelen_tijd_begin IS 'Time of first cooling measurement (free text, e.g. 14:30).';
COMMENT ON COLUMN haccp_bereiden.regenereer_tijd_minuten IS 'Regeneration duration in minutes; norm typically < 60.';

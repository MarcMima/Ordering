-- Hummus: same workflow as Falafel — soak dry chickpeas the day before; prep list / ordering show the soak callout.
-- Do not list under "Tomorrow (overnight)" or show per-card overnight banner.
UPDATE prep_items
SET
  requires_overnight = false,
  overnight_alert = NULL,
  updated_at = NOW()
WHERE lower(btrim(name)) = lower(btrim('Hummus'));

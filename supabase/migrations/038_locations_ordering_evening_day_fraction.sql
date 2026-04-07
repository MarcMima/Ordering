-- Extra "day fraction" for ordering after ~17:00: daily need × (1 + this) so evening sales are included.
-- Default 2/3 → multiplier 5/3 (e.g. 6 containers/day → plan for 6 + 4).
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS ordering_evening_day_fraction NUMERIC DEFAULT (2.0 / 3.0);

COMMENT ON COLUMN locations.ordering_evening_day_fraction IS
  'Fraction of one day raw need for the single evening window after order (~17:00–midnight). Order total uses daily_need × (this + cover_full_days), not ×(1+this) per day. Default 2/3.';

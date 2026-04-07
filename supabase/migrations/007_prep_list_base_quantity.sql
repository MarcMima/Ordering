-- Prep list: base quantity per location/prep item (needed for "needed = base_quantity × revenue_ratio")
ALTER TABLE location_prep_items
  ADD COLUMN IF NOT EXISTS base_quantity NUMERIC NOT NULL DEFAULT 1;

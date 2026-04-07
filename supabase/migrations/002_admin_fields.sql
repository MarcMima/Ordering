-- Admin panel: add columns for locations, suppliers, prep_items
-- Run after 001_initial_schema.sql

-- Locations: revenue and weekend multiplier
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS full_capacity_revenue NUMERIC,
  ADD COLUMN IF NOT EXISTS weekend_multiplier NUMERIC;

-- Suppliers: contact email and minimum order
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS minimum_order_value NUMERIC;

-- Prep items (products): batch, prep time, overnight and alerts
ALTER TABLE prep_items
  ADD COLUMN IF NOT EXISTS batch_size NUMERIC,
  ADD COLUMN IF NOT EXISTS prep_time_hours NUMERIC,
  ADD COLUMN IF NOT EXISTS requires_overnight BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS overnight_alert TEXT,
  ADD COLUMN IF NOT EXISTS special_alert TEXT;

-- day_of_week stays 0-6 in DB; admin UI maps Monday=1..Sunday=7 to 0..6

-- Weekend multiplier removed from app logic (was conflated with delivery-day planning). Bezorgdagen blijven via supplier_delivery_schedules / ordering.

ALTER TABLE locations DROP COLUMN IF EXISTS weekend_multiplier;

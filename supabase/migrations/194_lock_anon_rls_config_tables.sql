-- Lock down anon RLS: config tables become read-only for anon.
-- Operational tables (stocktake, prep, orders, HACCP) keep full access.
-- Also revoke sync_location_setup from anon/public.

-- 1. Revoke sync_location_setup (wipes-and-reseeds a location)
REVOKE EXECUTE ON FUNCTION public.sync_location_setup FROM anon, authenticated, PUBLIC;

-- 2. Config tables: replace FOR ALL with SELECT-only for anon
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'locations',
    'suppliers',
    'supplier_delivery_schedules',
    'supplier_ingredients',
    'supplier_order_channels',
    'raw_ingredients',
    'ingredient_pack_sizes',
    'location_prep_items',
    'prep_item_ingredients',
    'prep_items',
    'app_form_settings',
    'haccp_store_equipment'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS kitchen_anon_all ON %I', t);
    EXECUTE format(
      'CREATE POLICY kitchen_anon_read ON %I FOR SELECT TO anon USING (true)',
      t
    );
  END LOOP;
END $$;

-- 3. Operational tables keep full anon access (already have kitchen_anon_all from migration 151)
-- These are: daily_stock_counts, daily_prep_counts, daily_revenue_targets,
-- orders, order_line_items, order_dispatches,
-- haccp_temperaturen, haccp_ingangscontrole, haccp_bereiden,
-- haccp_schoonmaak, haccp_thermometers, haccp_leveranciers
-- (no changes needed — their kitchen_anon_all policy remains)

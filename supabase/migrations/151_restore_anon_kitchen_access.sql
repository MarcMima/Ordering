-- Temporary open access for anon role (used when NEXT_PUBLIC_AUTH_DISABLED=true).
-- Keeps existing authenticated policies; add parallel anon policies for kitchen ops.

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
    'daily_stock_counts',
    'daily_prep_counts',
    'daily_revenue_targets',
    'orders',
    'order_line_items',
    'prep_item_ingredients',
    'prep_items',
    'app_form_settings',
    'haccp_temperaturen',
    'haccp_ingangscontrole',
    'haccp_bereiden',
    'haccp_schoonmaak',
    'haccp_thermometers',
    'haccp_leveranciers',
    'haccp_store_equipment',
    'order_dispatches'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS kitchen_anon_all ON %I', t);
    EXECUTE format(
      'CREATE POLICY kitchen_anon_all ON %I FOR ALL TO anon USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;

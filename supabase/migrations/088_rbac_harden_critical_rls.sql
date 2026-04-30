-- Harden critical tables: remove permissive policies and enforce role + location checks.

CREATE OR REPLACE FUNCTION public.drop_all_policies(target_table TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = target_table
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p.policyname, target_table);
  END LOOP;
END;
$$;

DO $$
BEGIN
  PERFORM public.drop_all_policies('locations');
  CREATE POLICY locations_select ON locations
    FOR SELECT TO authenticated
    USING (public.has_location_access(id) OR public.has_permission('settings.manage') OR public.has_permission('reports.view'));
  CREATE POLICY locations_update_admin ON locations
    FOR UPDATE TO authenticated
    USING (public.has_permission('settings.manage'))
    WITH CHECK (public.has_permission('settings.manage'));
  CREATE POLICY locations_insert_admin ON locations
    FOR INSERT TO authenticated
    WITH CHECK (public.has_permission('settings.manage'));

  PERFORM public.drop_all_policies('suppliers');
  CREATE POLICY suppliers_select ON suppliers
    FOR SELECT TO authenticated
    USING (public.has_location_access(location_id));
  CREATE POLICY suppliers_manage ON suppliers
    FOR ALL TO authenticated
    USING (public.has_permission('settings.manage') AND public.has_location_access(location_id))
    WITH CHECK (public.has_permission('settings.manage') AND public.has_location_access(location_id));

  PERFORM public.drop_all_policies('supplier_delivery_schedules');
  CREATE POLICY supplier_delivery_schedules_select ON supplier_delivery_schedules
    FOR SELECT TO authenticated
    USING (public.has_location_access(location_id));
  CREATE POLICY supplier_delivery_schedules_manage ON supplier_delivery_schedules
    FOR ALL TO authenticated
    USING (public.has_permission('settings.manage') AND public.has_location_access(location_id))
    WITH CHECK (public.has_permission('settings.manage') AND public.has_location_access(location_id));

  PERFORM public.drop_all_policies('raw_ingredients');
  CREATE POLICY raw_ingredients_select ON raw_ingredients
    FOR SELECT TO authenticated
    USING (public.has_location_access(location_id));
  CREATE POLICY raw_ingredients_manage ON raw_ingredients
    FOR ALL TO authenticated
    USING (public.has_permission('settings.manage') AND public.has_location_access(location_id))
    WITH CHECK (public.has_permission('settings.manage') AND public.has_location_access(location_id));

  PERFORM public.drop_all_policies('ingredient_pack_sizes');
  CREATE POLICY ingredient_pack_sizes_select ON ingredient_pack_sizes
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM raw_ingredients r
        WHERE r.id = ingredient_pack_sizes.raw_ingredient_id
          AND public.has_location_access(r.location_id)
      )
    );
  CREATE POLICY ingredient_pack_sizes_manage ON ingredient_pack_sizes
    FOR ALL TO authenticated
    USING (
      public.has_permission('settings.manage')
      AND EXISTS (
        SELECT 1
        FROM raw_ingredients r
        WHERE r.id = ingredient_pack_sizes.raw_ingredient_id
          AND public.has_location_access(r.location_id)
      )
    )
    WITH CHECK (
      public.has_permission('settings.manage')
      AND EXISTS (
        SELECT 1
        FROM raw_ingredients r
        WHERE r.id = ingredient_pack_sizes.raw_ingredient_id
          AND public.has_location_access(r.location_id)
      )
    );

  PERFORM public.drop_all_policies('location_prep_items');
  CREATE POLICY location_prep_items_select ON location_prep_items
    FOR SELECT TO authenticated
    USING (public.has_location_access(location_id));
  CREATE POLICY location_prep_items_manage ON location_prep_items
    FOR ALL TO authenticated
    USING (public.has_permission('settings.manage') AND public.has_location_access(location_id))
    WITH CHECK (public.has_permission('settings.manage') AND public.has_location_access(location_id));

  PERFORM public.drop_all_policies('daily_stock_counts');
  CREATE POLICY daily_stock_counts_select ON daily_stock_counts
    FOR SELECT TO authenticated
    USING (public.has_location_access(location_id));
  CREATE POLICY daily_stock_counts_manage ON daily_stock_counts
    FOR ALL TO authenticated
    USING (public.has_permission('operations.manage') AND public.has_location_access(location_id))
    WITH CHECK (public.has_permission('operations.manage') AND public.has_location_access(location_id));

  PERFORM public.drop_all_policies('daily_prep_counts');
  CREATE POLICY daily_prep_counts_select ON daily_prep_counts
    FOR SELECT TO authenticated
    USING (public.has_location_access(location_id));
  CREATE POLICY daily_prep_counts_manage ON daily_prep_counts
    FOR ALL TO authenticated
    USING (public.has_permission('operations.manage') AND public.has_location_access(location_id))
    WITH CHECK (public.has_permission('operations.manage') AND public.has_location_access(location_id));

  PERFORM public.drop_all_policies('daily_revenue_targets');
  CREATE POLICY daily_revenue_targets_select ON daily_revenue_targets
    FOR SELECT TO authenticated
    USING (public.has_location_access(location_id));
  CREATE POLICY daily_revenue_targets_manage ON daily_revenue_targets
    FOR ALL TO authenticated
    USING (
      (public.has_permission('reports.view') OR public.has_permission('operations.manage'))
      AND public.has_location_access(location_id)
    )
    WITH CHECK (
      (public.has_permission('reports.view') OR public.has_permission('operations.manage'))
      AND public.has_location_access(location_id)
    );

  PERFORM public.drop_all_policies('orders');
  CREATE POLICY orders_select ON orders
    FOR SELECT TO authenticated
    USING (public.has_location_access(location_id));
  CREATE POLICY orders_manage ON orders
    FOR ALL TO authenticated
    USING (public.has_permission('operations.manage') AND public.has_location_access(location_id))
    WITH CHECK (public.has_permission('operations.manage') AND public.has_location_access(location_id));

  PERFORM public.drop_all_policies('order_line_items');
  CREATE POLICY order_line_items_select ON order_line_items
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM orders o
        WHERE o.id = order_line_items.order_id
          AND public.has_location_access(o.location_id)
      )
    );
  CREATE POLICY order_line_items_manage ON order_line_items
    FOR ALL TO authenticated
    USING (
      public.has_permission('operations.manage')
      AND EXISTS (
        SELECT 1
        FROM orders o
        WHERE o.id = order_line_items.order_id
          AND public.has_location_access(o.location_id)
      )
    )
    WITH CHECK (
      public.has_permission('operations.manage')
      AND EXISTS (
        SELECT 1
        FROM orders o
        WHERE o.id = order_line_items.order_id
          AND public.has_location_access(o.location_id)
      )
    );

  PERFORM public.drop_all_policies('supplier_ingredients');
  CREATE POLICY supplier_ingredients_select ON supplier_ingredients
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM suppliers s
        WHERE s.id = supplier_ingredients.supplier_id
          AND public.has_location_access(s.location_id)
      )
    );
  CREATE POLICY supplier_ingredients_manage ON supplier_ingredients
    FOR ALL TO authenticated
    USING (
      public.has_permission('settings.manage')
      AND EXISTS (
        SELECT 1
        FROM suppliers s
        WHERE s.id = supplier_ingredients.supplier_id
          AND public.has_location_access(s.location_id)
      )
    )
    WITH CHECK (
      public.has_permission('settings.manage')
      AND EXISTS (
        SELECT 1
        FROM suppliers s
        WHERE s.id = supplier_ingredients.supplier_id
          AND public.has_location_access(s.location_id)
      )
    );

  PERFORM public.drop_all_policies('prep_item_ingredients');
  CREATE POLICY prep_item_ingredients_select ON prep_item_ingredients
    FOR SELECT TO authenticated
    USING (true);
  CREATE POLICY prep_item_ingredients_manage ON prep_item_ingredients
    FOR ALL TO authenticated
    USING (public.has_permission('settings.manage'))
    WITH CHECK (public.has_permission('settings.manage'));
END $$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'haccp_temperaturen',
    'haccp_ingangscontrole',
    'haccp_bereiden',
    'haccp_schoonmaak',
    'haccp_thermometers'
  ]
  LOOP
    PERFORM public.drop_all_policies(t);
    EXECUTE format(
      'CREATE POLICY %I ON %I
       FOR SELECT TO authenticated
       USING (
         EXISTS (
           SELECT 1
           FROM locations l
           WHERE l.haccp_store_id = %2$I.store_id
             AND public.has_location_access(l.id)
         )
       )',
      t || '_select',
      t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I
       FOR ALL TO authenticated
       USING (
         (public.has_permission(''haccp.fill'') OR public.has_permission(''haccp.manage''))
         AND EXISTS (
           SELECT 1
           FROM locations l
           WHERE l.haccp_store_id = %2$I.store_id
             AND public.has_location_access(l.id)
         )
       )
       WITH CHECK (
         (public.has_permission(''haccp.fill'') OR public.has_permission(''haccp.manage''))
         AND EXISTS (
           SELECT 1
           FROM locations l
           WHERE l.haccp_store_id = %2$I.store_id
             AND public.has_location_access(l.id)
         )
       )',
      t || '_manage',
      t
    );
  END LOOP;
END $$;

DO $$
BEGIN
  PERFORM public.drop_all_policies('haccp_leveranciers');
  CREATE POLICY haccp_leveranciers_select ON haccp_leveranciers
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM locations l
        WHERE l.haccp_store_id = haccp_leveranciers.store_id
          AND public.has_location_access(l.id)
      )
    );
  CREATE POLICY haccp_leveranciers_manage ON haccp_leveranciers
    FOR ALL TO authenticated
    USING (
      public.has_permission('haccp.manage')
      AND EXISTS (
        SELECT 1
        FROM locations l
        WHERE l.haccp_store_id = haccp_leveranciers.store_id
          AND public.has_location_access(l.id)
      )
    )
    WITH CHECK (
      public.has_permission('haccp.manage')
      AND EXISTS (
        SELECT 1
        FROM locations l
        WHERE l.haccp_store_id = haccp_leveranciers.store_id
          AND public.has_location_access(l.id)
      )
    );
END $$;

DO $$
BEGIN
  PERFORM public.drop_all_policies('haccp_store_equipment');
  CREATE POLICY haccp_store_equipment_select ON haccp_store_equipment
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM locations l
        WHERE l.haccp_store_id = haccp_store_equipment.store_id
          AND public.has_location_access(l.id)
      )
    );
  CREATE POLICY haccp_store_equipment_manage ON haccp_store_equipment
    FOR ALL TO authenticated
    USING (public.has_permission('haccp.manage'))
    WITH CHECK (public.has_permission('haccp.manage'));
END $$;

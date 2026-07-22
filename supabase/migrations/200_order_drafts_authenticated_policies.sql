-- Post-rollout fix: order_drafts kreeg in migratie 197 alleen een anon-policy.
-- Productie draait met logins (authenticated), waardoor het bestel-concept door RLS
-- werd geweigerd (niet opgeslagen, geen "concept hersteld"-banner).
--
-- Spiegelt de effectieve authenticated-policies van daily_stock_counts (migratie 088):
--   SELECT: has_location_access(location_id)
--   ALL:    has_permission('operations.manage') AND has_location_access(location_id)
--
-- De bestaande anon-policy (order_drafts_anon_all) blijft staan, zodat kitchen-mode
-- (NEXT_PUBLIC_AUTH_DISABLED=true) ongewijzigd blijft werken.
-- Additief + idempotent.

DROP POLICY IF EXISTS order_drafts_select_authenticated ON order_drafts;
CREATE POLICY order_drafts_select_authenticated ON order_drafts
  FOR SELECT TO authenticated
  USING (public.has_location_access(location_id));

DROP POLICY IF EXISTS order_drafts_manage_authenticated ON order_drafts;
CREATE POLICY order_drafts_manage_authenticated ON order_drafts
  FOR ALL TO authenticated
  USING (public.has_permission('operations.manage') AND public.has_location_access(location_id))
  WITH CHECK (public.has_permission('operations.manage') AND public.has_location_access(location_id));

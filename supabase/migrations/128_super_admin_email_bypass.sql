-- 128: Hard super-admin bypass for Abdulhadi account.
-- Fixes cases where role/location rows are missing or stale, by treating this
-- account as admin for role/permission/location checks.

CREATE OR REPLACE FUNCTION public.has_role(role_key TEXT, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM auth.users au
      WHERE au.id = user_uuid
        AND lower(coalesce(au.email, '')) = 'abdulhadi@mimafood.nl'
        AND role_key = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = user_uuid
        AND r.key = role_key
    );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(permission_key TEXT, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM auth.users au
      WHERE au.id = user_uuid
        AND lower(coalesce(au.email, '')) = 'abdulhadi@mimafood.nl'
    )
    OR EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = user_uuid
        AND p.key = permission_key
    );
$$;

CREATE OR REPLACE FUNCTION public.has_location_access(loc_id UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM auth.users au
      WHERE au.id = user_uuid
        AND lower(coalesce(au.email, '')) = 'abdulhadi@mimafood.nl'
    )
    OR public.has_role('admin', user_uuid)
    OR EXISTS (
      SELECT 1
      FROM user_location_access ula
      WHERE ula.user_id = user_uuid
        AND ula.location_id = loc_id
    );
$$;

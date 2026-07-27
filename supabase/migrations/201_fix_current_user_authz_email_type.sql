-- Post-rollout fix (Problem 4): current_user_authz crashed for every logged-in user.
--
-- The function declares column 2 (email) as TEXT, but returned character varying
-- because auth.users.email is a varchar. PostgreSQL rejects this at runtime with
--   42804: structure of query does not match function result type
--   ("Returned type character varying does not match expected type text in column 2")
--
-- anon never hit it (early RETURN when auth.uid() IS NULL), so it only broke
-- authenticated users: the auth middleware's current_user_authz call errored,
-- which fail-closed every /admin request to '/' — even for real admins.
--
-- Fix: cast the email column to text so the result matches the declared signature.
-- Identical to the migration-087 definition otherwise. CREATE OR REPLACE = idempotent.

CREATE OR REPLACE FUNCTION public.current_user_authz()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  role_keys TEXT[],
  permission_keys TEXT[],
  location_ids UUID[],
  is_admin BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    uid,
    COALESCE(au.email, up.email)::text,
    COALESCE((
      SELECT array_agg(DISTINCT r.key ORDER BY r.key)
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = uid
    ), '{}'::TEXT[]),
    COALESCE((
      SELECT array_agg(DISTINCT p.key ORDER BY p.key)
      FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = uid
    ), '{}'::TEXT[]),
    COALESCE((
      SELECT array_agg(DISTINCT ula.location_id ORDER BY ula.location_id)
      FROM user_location_access ula
      WHERE ula.user_id = uid
    ), '{}'::UUID[]),
    public.has_role('admin', uid)
  FROM auth.users au
  LEFT JOIN user_profiles up ON up.user_id = au.id
  WHERE au.id = uid;
END;
$$;

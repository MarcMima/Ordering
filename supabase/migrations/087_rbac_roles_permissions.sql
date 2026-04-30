-- RBAC foundation: roles, permissions, user-role assignments and location access.

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS user_location_access (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_location_access_user_id ON user_location_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_location_access_location_id ON user_location_access(location_id);

INSERT INTO roles (key, label) VALUES
  ('admin', 'Administrator'),
  ('manager', 'Manager'),
  ('employee', 'Employee')
ON CONFLICT (key) DO NOTHING;

INSERT INTO permissions (key, label) VALUES
  ('users.manage', 'Manage users, roles and location access'),
  ('settings.manage', 'Manage app settings and admin data'),
  ('operations.manage', 'Create and update daily operations forms'),
  ('haccp.fill', 'Fill HACCP forms'),
  ('haccp.manage', 'Manage HACCP configuration and documents'),
  ('reports.view', 'View reports and dashboards')
ON CONFLICT (key) DO NOTHING;

WITH matrix(role_key, permission_key) AS (
  VALUES
    ('admin', 'users.manage'),
    ('admin', 'settings.manage'),
    ('admin', 'operations.manage'),
    ('admin', 'haccp.fill'),
    ('admin', 'haccp.manage'),
    ('admin', 'reports.view'),
    ('manager', 'settings.manage'),
    ('manager', 'operations.manage'),
    ('manager', 'haccp.fill'),
    ('manager', 'haccp.manage'),
    ('manager', 'reports.view'),
    ('employee', 'operations.manage'),
    ('employee', 'haccp.fill')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM matrix m
JOIN roles r ON r.key = m.role_key
JOIN permissions p ON p.key = m.permission_key
ON CONFLICT (role_id, permission_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_role(role_key TEXT, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
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
  SELECT EXISTS (
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
    public.has_role('admin', user_uuid)
    OR EXISTS (
      SELECT 1
      FROM user_location_access ula
      WHERE ula.user_id = user_uuid
        AND ula.location_id = loc_id
    );
$$;

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
    COALESCE(au.email, up.email),
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

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_location_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profiles_select ON user_profiles;
CREATE POLICY user_profiles_select ON user_profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission('users.manage'));

DROP POLICY IF EXISTS user_profiles_manage ON user_profiles;
CREATE POLICY user_profiles_manage ON user_profiles
  FOR ALL TO authenticated
  USING (public.has_permission('users.manage'))
  WITH CHECK (public.has_permission('users.manage'));

DROP POLICY IF EXISTS roles_select ON roles;
CREATE POLICY roles_select ON roles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS permissions_select ON permissions;
CREATE POLICY permissions_select ON permissions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS role_permissions_select ON role_permissions;
CREATE POLICY role_permissions_select ON role_permissions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS rbac_manage_user_roles ON user_roles;
CREATE POLICY rbac_manage_user_roles ON user_roles
  FOR ALL TO authenticated
  USING (public.has_permission('users.manage'))
  WITH CHECK (public.has_permission('users.manage'));

DROP POLICY IF EXISTS rbac_manage_user_location_access ON user_location_access;
CREATE POLICY rbac_manage_user_location_access ON user_location_access
  FOR ALL TO authenticated
  USING (public.has_permission('users.manage'))
  WITH CHECK (public.has_permission('users.manage'));

-- Bootstrap current known top-level account.
DO $$
DECLARE
  hadi_id UUID;
  admin_role_id UUID;
BEGIN
  SELECT id INTO hadi_id
  FROM auth.users
  WHERE lower(email) = 'abdulhadi@mimafood.nl'
  LIMIT 1;

  SELECT id INTO admin_role_id
  FROM roles
  WHERE key = 'admin'
  LIMIT 1;

  IF hadi_id IS NOT NULL AND admin_role_id IS NOT NULL THEN
    INSERT INTO user_profiles (user_id, email, display_name, active)
    VALUES (hadi_id, 'abdulhadi@mimafood.nl', 'Abdulhadi', true)
    ON CONFLICT (user_id) DO UPDATE
      SET email = EXCLUDED.email,
          updated_at = NOW();

    INSERT INTO user_roles (user_id, role_id)
    VALUES (hadi_id, admin_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;
END $$;

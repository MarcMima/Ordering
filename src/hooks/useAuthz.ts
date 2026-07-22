"use client";

import { useCallback, useEffect, useState } from "react";
import { isAuthDisabled } from "@/lib/authMode";
import { createClient } from "@/lib/supabase";
import {
  EMPTY_AUTHZ,
  hasAnyPermission,
  hasPermission,
  PERMISSIONS,
  type AuthzState,
  type PermissionKey,
} from "@/lib/authz";

const AUTH_DISABLED_AUTHZ: AuthzState = {
  userId: null,
  email: null,
  roleKeys: ["admin"],
  permissionKeys: Object.values(PERMISSIONS),
  locationIds: [],
  isAdmin: true,
};

type AuthzRow = {
  user_id: string;
  email: string | null;
  role_keys: string[] | null;
  permission_keys: string[] | null;
  location_ids: string[] | null;
  is_admin: boolean | null;
};

export function useAuthz() {
  const [authz, setAuthz] = useState<AuthzState>(EMPTY_AUTHZ);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (isAuthDisabled()) {
      setAuthz(AUTH_DISABLED_AUTHZ);
      setError(null);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) {
      setAuthz(EMPTY_AUTHZ);
      setError(userError?.message ?? null);
      setLoading(false);
      return;
    }

    const { data: authzData, error: authzError } = await supabase
      .rpc("current_user_authz")
      .single<AuthzRow>();

    if (authzError || !authzData) {
      // Fail closed: never synthesize isAdmin on RPC error.
      // The user keeps basic access but no admin privileges.
      setAuthz({
        ...EMPTY_AUTHZ,
        userId: data.user.id,
        email: data.user.email ?? null,
        isAdmin: false,
      });
      setError(authzError?.message ?? "Authorization unavailable — please retry");
      setLoading(false);
      return;
    }

    setAuthz({
      userId: authzData.user_id ?? data.user.id,
      email: authzData.email ?? data.user.email ?? null,
      roleKeys: authzData.role_keys ?? [],
      permissionKeys: authzData.permission_keys ?? [],
      locationIds: authzData.location_ids ?? [],
      isAdmin: Boolean(authzData.is_admin),
    });
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch();
  }, [refetch]);

  const can = useCallback(
    (permission: PermissionKey) => hasPermission(authz, permission),
    [authz]
  );
  const canAny = useCallback(
    (permissions: PermissionKey[]) => hasAnyPermission(authz, permissions),
    [authz]
  );

  return { authz, loading, error, refetch, can, canAny };
}


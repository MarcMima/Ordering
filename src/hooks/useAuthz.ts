"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { EMPTY_AUTHZ, hasAnyPermission, hasPermission, type AuthzState, type PermissionKey } from "@/lib/authz";

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
      setAuthz({
        ...EMPTY_AUTHZ,
        userId: data.user.id,
        email: data.user.email ?? null,
      });
      setError(authzError?.message ?? null);
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


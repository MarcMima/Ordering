"use client";

import { PERMISSIONS, type PermissionKey } from "@/lib/authz";
import { useAuthz } from "./useAuthz";

export function useCan(permission: PermissionKey) {
  const { can, loading, error } = useAuthz();
  return { allowed: can(permission), loading, error };
}

export { PERMISSIONS };


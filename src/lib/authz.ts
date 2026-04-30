export const PERMISSIONS = {
  usersManage: "users.manage",
  settingsManage: "settings.manage",
  operationsManage: "operations.manage",
  haccpFill: "haccp.fill",
  haccpManage: "haccp.manage",
  reportsView: "reports.view",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type AuthzState = {
  userId: string | null;
  email: string | null;
  roleKeys: string[];
  permissionKeys: string[];
  locationIds: string[];
  isAdmin: boolean;
};

export const EMPTY_AUTHZ: AuthzState = {
  userId: null,
  email: null,
  roleKeys: [],
  permissionKeys: [],
  locationIds: [],
  isAdmin: false,
};

export function hasPermission(authz: AuthzState, permission: PermissionKey): boolean {
  return authz.isAdmin || authz.permissionKeys.includes(permission);
}

export function hasAnyPermission(authz: AuthzState, permissions: PermissionKey[]): boolean {
  return permissions.some((p) => hasPermission(authz, p));
}


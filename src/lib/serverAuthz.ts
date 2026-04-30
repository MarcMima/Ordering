import { createClient } from "@/lib/supabase/server";

type AuthzRow = {
  user_id: string;
  permission_keys: string[] | null;
  is_admin: boolean | null;
};

export async function requirePermission(permission: string) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, status: 401, message: "Not authenticated" };
  }

  const { data } = await supabase.rpc("current_user_authz").single<AuthzRow>();
  const isAdmin = Boolean(data?.is_admin);
  const permissions = data?.permission_keys ?? [];
  if (!isAdmin && !permissions.includes(permission)) {
    return { ok: false as const, status: 403, message: "Forbidden" };
  }

  return { ok: true as const, userId: userData.user.id };
}


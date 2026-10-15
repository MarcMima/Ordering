// Access gate for the owners-only finance section (/admin/finance, /api/finance).
// Not role-based on purpose: other admins (e.g. Hadi) must not see it.
// Allow-list lives in financeOwners.ts (FINANCE_OWNER_EMAILS env override).

import { isAuthDisabled } from "@/lib/authMode";
import { createClient } from "@/lib/supabase/server";
import { isFinanceOwnerEmail } from "@/lib/financeOwners";

export { isFinanceOwnerEmail };

export async function requireFinanceOwner() {
  if (isAuthDisabled()) {
    return { ok: false as const, status: 403, message: "Not available in kitchen mode" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false as const, status: 401, message: "Not authenticated" };
  if (!isFinanceOwnerEmail(data.user.email)) return { ok: false as const, status: 404, message: "Not found" };
  return { ok: true as const, email: data.user.email as string };
}

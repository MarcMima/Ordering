import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/serverAuthz";

type PatchPayload = {
  roleKey?: "admin" | "manager" | "employee";
  locationIds?: string[];
  displayName?: string | null;
  active?: boolean;
};

function normalizeLocationIds(ids: string[] | undefined): string[] {
  return [...new Set((ids ?? []).filter(Boolean))];
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const auth = await requirePermission("users.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { userId } = await context.params;
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  let body: PatchPayload;
  try {
    body = (await request.json()) as PatchPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (body.displayName !== undefined || body.active !== undefined) {
    await admin.from("user_profiles").upsert({
      user_id: userId,
      display_name: body.displayName ?? null,
      active: body.active ?? true,
      updated_at: new Date().toISOString(),
    });
  }

  if (body.roleKey) {
    const { data: roleRow, error: roleErr } = await admin
      .from("roles")
      .select("id, key")
      .eq("key", body.roleKey)
      .single();
    if (roleErr || !roleRow) {
      return NextResponse.json({ error: "Unknown roleKey" }, { status: 400 });
    }
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("user_roles").insert({ user_id: userId, role_id: roleRow.id });
  }

  if (body.locationIds) {
    const locationIds = normalizeLocationIds(body.locationIds);
    await admin.from("user_location_access").delete().eq("user_id", userId);
    if (body.roleKey !== "admin" && locationIds.length > 0) {
      await admin
        .from("user_location_access")
        .insert(locationIds.map((locationId) => ({ user_id: userId, location_id: locationId })));
    }
  }

  return NextResponse.json({ ok: true });
}


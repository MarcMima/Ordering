import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/serverAuthz";

type UserPayload = {
  email: string;
  displayName?: string | null;
  roleKey: "admin" | "manager" | "employee";
  locationIds: string[];
  flow?: "invite" | "link_existing";
};

function normalizeLocationIds(ids: string[] | undefined): string[] {
  return [...new Set((ids ?? []).filter(Boolean))];
}

async function findUserByEmail(email: string) {
  const admin = createAdminClient();
  const normalized = email.trim().toLowerCase();
  let page = 1;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === normalized);
    if (found) return found;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

export async function GET() {
  const auth = await requirePermission("users.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const admin = createAdminClient();
  const [{ data: usersData, error: usersError }, { data: rolesData }, { data: locationsData }] =
    await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      admin.from("roles").select("id, key"),
      admin.from("locations").select("id, name").order("name"),
    ]);

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  const users = usersData.users ?? [];
  const userIds = users.map((u) => u.id);
  const roleById = new Map((rolesData ?? []).map((r) => [r.id as string, r.key as string]));

  const [{ data: userRoles }, { data: locationAccess }, { data: profiles }] = await Promise.all([
    userIds.length
      ? admin.from("user_roles").select("user_id, role_id").in("user_id", userIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? admin.from("user_location_access").select("user_id, location_id").in("user_id", userIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? admin.from("user_profiles").select("user_id, display_name, active, email").in("user_id", userIds)
      : Promise.resolve({ data: [] }),
  ]);

  const rolesByUser = new Map<string, string[]>();
  for (const row of (userRoles ?? []) as { user_id: string; role_id: string }[]) {
    const key = roleById.get(row.role_id);
    if (!key) continue;
    if (!rolesByUser.has(row.user_id)) rolesByUser.set(row.user_id, []);
    rolesByUser.get(row.user_id)!.push(key);
  }

  const locationsByUser = new Map<string, string[]>();
  for (const row of (locationAccess ?? []) as { user_id: string; location_id: string }[]) {
    if (!locationsByUser.has(row.user_id)) locationsByUser.set(row.user_id, []);
    locationsByUser.get(row.user_id)!.push(row.location_id);
  }

  const profileByUser = new Map<string, { display_name: string | null; active: boolean | null; email: string | null }>();
  for (const row of (profiles ?? []) as { user_id: string; display_name: string | null; active: boolean | null; email: string | null }[]) {
    profileByUser.set(row.user_id, row);
  }

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      roles: rolesByUser.get(u.id) ?? [],
      location_ids: locationsByUser.get(u.id) ?? [],
      display_name: profileByUser.get(u.id)?.display_name ?? null,
      active: profileByUser.get(u.id)?.active ?? true,
    })),
    locations: locationsData ?? [],
  });
}

export async function POST(request: Request) {
  const auth = await requirePermission("users.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let body: UserPayload;
  try {
    body = (await request.json()) as UserPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
  if (!body.roleKey) return NextResponse.json({ error: "roleKey is required" }, { status: 400 });

  const locationIds = normalizeLocationIds(body.locationIds);
  const flow = body.flow ?? "invite";
  const admin = createAdminClient();

  const { data: roleRow, error: roleErr } = await admin
    .from("roles")
    .select("id, key")
    .eq("key", body.roleKey)
    .single();
  if (roleErr || !roleRow) {
    return NextResponse.json({ error: "Unknown roleKey" }, { status: 400 });
  }

  let userId: string | null = null;
  if (flow === "invite") {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    userId = data.user?.id ?? null;
  } else {
    const existing = await findUserByEmail(email);
    userId = existing?.id ?? null;
  }

  if (!userId) {
    return NextResponse.json(
      { error: flow === "invite" ? "Invite created but no user id returned yet." : "User not found by email" },
      { status: 400 }
    );
  }

  await admin.from("user_profiles").upsert({
    user_id: userId,
    email,
    display_name: body.displayName ?? null,
    active: true,
    updated_at: new Date().toISOString(),
  });

  await admin.from("user_roles").delete().eq("user_id", userId);
  await admin.from("user_roles").insert({ user_id: userId, role_id: roleRow.id });

  await admin.from("user_location_access").delete().eq("user_id", userId);
  if (body.roleKey !== "admin" && locationIds.length > 0) {
    await admin.from("user_location_access").insert(
      locationIds.map((locationId) => ({ user_id: userId!, location_id: locationId }))
    );
  }

  return NextResponse.json({ ok: true, user_id: userId });
}


import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/serverAuthz";

const ALLOWED_FIELDS = new Set([
  "order_pack_multiple",
  "ordering_daily_need_multiplier",
  "ordering_min_order_packs",
  "ordering_max_order_base",
  "ordering_min_order_base",
  "stock_par_kind",
  "stock_par_min_amount",
  "stock_par_min_packs",
  "stock_par_order_packs",
]);

export async function PATCH(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let body: { id: string; fields: Record<string, unknown> };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!body.fields || typeof body.fields !== "object") {
    return NextResponse.json({ error: "fields is required" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(body.fields)) {
    if (!ALLOWED_FIELDS.has(key)) {
      return NextResponse.json({ error: `Field '${key}' is not editable via this endpoint` }, { status: 400 });
    }
    update[key] = val;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("raw_ingredients").update(update).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

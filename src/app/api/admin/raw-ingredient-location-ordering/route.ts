import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/serverAuthz";

export async function PUT(request: Request) {
  const auth = await requirePermission("settings.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let body: { raw_ingredient_id: string; location_id: string; daily_need_multiplier?: number | null; standing_order_packs?: number | null };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.raw_ingredient_id) return NextResponse.json({ error: "raw_ingredient_id is required" }, { status: 400 });
  if (!body.location_id) return NextResponse.json({ error: "location_id is required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("raw_ingredient_location_ordering")
    .upsert(
      {
        raw_ingredient_id: body.raw_ingredient_id,
        location_id: body.location_id,
        daily_need_multiplier: body.daily_need_multiplier ?? null,
        standing_order_packs: body.standing_order_packs ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "raw_ingredient_id,location_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

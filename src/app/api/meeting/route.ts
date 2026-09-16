import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/serverAuthz";
import {
  AGENDA_ASKS,
  DOMAINS,
  MEETING_LABEL,
  PEOPLE,
  TASK_STATUSES,
  createAgendaItem,
  currentWindow,
  defaultMeetingType,
  fetchAgenda,
  fetchMeetingRecord,
  fetchOpenTasks,
  getNotion,
  setAgendaStatus,
  setTaskStatus,
  type MeetingType,
  type TaskStatus,
} from "@/lib/notionMeeting";

// Meeting cockpit API — lees/schrijf-laag op Notion voor /meeting.
// Auth: ingelogde gebruiker met settings.manage (= management). Deze route staat
// bewust NIET in de middleware-uitsluiting: hij hoort achter de Supabase-login.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERMISSION = "settings.manage";

function parseType(v: string | null): MeetingType | null {
  return v === "MMMM" || v === "MMM" || v === "QMM" ? v : null;
}

export async function GET(req: Request) {
  const auth = await requirePermission(PERMISSION);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const url = new URL(req.url);
  const type = parseType(url.searchParams.get("type")) ?? defaultMeetingType();

  try {
    const notion = getNotion();
    const [agenda, tasks, meeting] = await Promise.all([
      fetchAgenda(notion, type),
      fetchOpenTasks(notion),
      fetchMeetingRecord(notion, type).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })),
    ]);
    return NextResponse.json({
      type,
      label: MEETING_LABEL[type],
      window: currentWindow(type),
      defaultType: defaultMeetingType(),
      meeting: meeting && "error" in meeting ? null : meeting,
      meetingError: meeting && "error" in meeting ? meeting.error : undefined,
      agenda,
      tasks,
      people: PEOPLE,
      options: { asks: AGENDA_ASKS, domains: DOMAINS, taskStatuses: TASK_STATUSES },
      fetchedAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

type Action =
  | { action: "agenda.status"; id: string; status: "Proposed" | "Scheduled" | "Discussed" | "Parked" | "Dropped"; outcome?: string; meetingType?: MeetingType; meetingRecordId?: string | null }
  | { action: "agenda.create"; topic: string; meetingType: MeetingType; ask?: string | null; domain?: string | null; whyNow?: string; context?: string | null; minutes?: number | null; raisedBy?: string | null }
  | { action: "task.status"; id: string; status: TaskStatus };

export async function POST(req: Request) {
  const auth = await requirePermission(PERMISSION);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let body: Action;
  try {
    body = (await req.json()) as Action;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const notion = getNotion();
    if (body.action === "agenda.status") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      await setAgendaStatus(notion, body.id, body.status, {
        outcome: body.outcome,
        meetingType: body.meetingType,
        meetingRecordId: body.meetingRecordId ?? null,
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "agenda.create") {
      const topic = (body.topic ?? "").trim();
      if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });
      if (!parseType(body.meetingType)) return NextResponse.json({ error: "meetingType invalid" }, { status: 400 });
      const created = await createAgendaItem(notion, { ...body, topic, source: `meeting cockpit ${new Date().toISOString().slice(0, 10)}` });
      return NextResponse.json({ ok: true, created });
    }
    if (body.action === "task.status") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      if (!(TASK_STATUSES as readonly string[]).includes(body.status)) {
        return NextResponse.json({ error: "status invalid" }, { status: 400 });
      }
      await setTaskStatus(notion, body.id, body.status);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

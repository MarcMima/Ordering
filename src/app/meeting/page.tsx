"use client";

// Meeting cockpit — één scherm voor de Mima-managementmeeting (MMMM/MMM/QMM).
// Leest en schrijft via /api/meeting (Notion blijft de bron van waarheid).
// UI-taal: Engels (Hadi leest mee).

import { useCallback, useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/TopNav";
import { useCan, PERMISSIONS } from "@/hooks/useCan";
import { useAuthz } from "@/hooks/useAuthz";

type MeetingType = "MMMM" | "MMM" | "QMM";

type AgendaItem = {
  id: string;
  url: string;
  topic: string;
  meetingType: MeetingType | null;
  status: string;
  ask: string | null;
  domain: string | null;
  raisedBy: string[];
  whyNow: string;
  context: string | null;
  minutes: number | null;
  targetDate: string | null;
  outcome: string;
  created: string;
};

type TaskItem = {
  id: string;
  url: string;
  task: string;
  owners: string[];
  domain: string | null;
  priority: string | null;
  status: string;
  deadline: string | null;
  blocker: string;
  notes: string;
  createdInMeeting: boolean;
};

type MeetingRecord = { id: string; url: string; name: string; date: string | null; status: string | null };

type Payload = {
  type: MeetingType;
  label: string;
  window: { start: string; end: string };
  defaultType: MeetingType;
  meeting: MeetingRecord | null;
  meetingError?: string;
  agenda: AgendaItem[];
  tasks: TaskItem[];
  people: Record<string, { id: string; name: string; short: string }>;
  options: { asks: string[]; domains: string[]; taskStatuses: string[] };
  fetchedAt: string;
};

const TYPES: { key: MeetingType; label: string; sub: string }[] = [
  { key: "MMMM", label: "MMMM", sub: "weekly · operational" },
  { key: "MMM", label: "MMM", sub: "monthly · tactical" },
  { key: "QMM", label: "QMM", sub: "quarterly · strategic" },
];

const PEOPLE_ORDER = ["marc", "michiel", "hadi"];
const OPEN_STATUSES = ["To do", "In progress", "Waiting / Blocked"];
const TOGGLE_STATUSES = ["To do", "In progress", "Waiting / Blocked", "Done"];

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00Z" : ""));
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" }).format(d);
}

function askClass(ask: string | null): string {
  switch (ask) {
    case "Decide":
      return "bg-accent-terracotta/15 text-accent-terracotta";
    case "Brainstorm":
      return "bg-brand-sand/70 text-brand-orange";
    case "Inform":
      return "bg-surface-muted text-ink-soft";
    default:
      return "bg-brand-sage/30 text-brand-green";
  }
}

function statusClass(status: string): string {
  switch (status) {
    case "In progress":
      return "border-brand-orange/40 bg-brand-sand/50 text-accent-orange";
    case "Waiting / Blocked":
      return "border-accent-terracotta/40 bg-accent-terracotta/10 text-accent-terracotta";
    case "Done":
      return "border-brand-green/40 bg-brand-sage/30 text-brand-green";
    case "Drafts for review":
      return "border-brand-green/15 bg-surface-muted text-ink-soft";
    default:
      return "border-brand-green/20 bg-surface text-ink";
  }
}

export default function MeetingPage() {
  const { allowed, loading: authzLoading } = useCan(PERMISSIONS.settingsManage);
  const { authz } = useAuthz();
  const [type, setType] = useState<MeetingType | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [showParked, setShowParked] = useState(false);
  const [outcomeDraft, setOutcomeDraft] = useState<Record<string, string>>({});
  const [openAgenda, setOpenAgenda] = useState<Record<string, boolean>>({});

  // Wie zit er achter het scherm? (voor Raised by bij snel-invoer)
  const me = useMemo(() => {
    const email = (authz.email ?? "").toLowerCase();
    if (email.startsWith("marc@")) return "marc";
    if (email.startsWith("michiel@")) return "michiel";
    if (email.startsWith("abdulhadi@") || email.startsWith("hadi@")) return "hadi";
    return null;
  }, [authz.email]);

  const load = useCallback(
    async (t: MeetingType | null, silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/meeting${t ? `?type=${t}` : ""}`, { cache: "no-store" });
        const json = (await res.json()) as Payload & { error?: string };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setData(json);
        if (!t) setType(json.type);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (allowed) void load(type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, type]);

  async function post(key: string, body: Record<string, unknown>): Promise<boolean> {
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await fetch("/api/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  // ---- agenda-acties (optimistisch, daarna stil herladen) ----
  async function agendaStatus(item: AgendaItem, status: "Discussed" | "Parked" | "Proposed" | "Scheduled") {
    if (!data) return;
    const outcome = status === "Discussed" ? (outcomeDraft[item.id] ?? "").trim() : undefined;
    setData({ ...data, agenda: status === "Discussed" ? data.agenda.filter((a) => a.id !== item.id) : data.agenda.map((a) => (a.id === item.id ? { ...a, status } : a)) });
    const ok = await post(item.id, {
      action: "agenda.status",
      id: item.id,
      status,
      outcome,
      meetingType: data.type,
      meetingRecordId: data.meeting?.id ?? null,
    });
    if (ok) void load(type, true);
    else void load(type, true);
  }

  async function taskStatus(task: TaskItem, status: string) {
    if (!data) return;
    setData({ ...data, tasks: data.tasks.map((t) => (t.id === task.id ? { ...t, status } : t)) });
    const ok = await post(task.id, { action: "task.status", id: task.id, status });
    if (!ok) void load(type, true);
  }

  // ---- afgeleiden ----
  const today = todayIso();
  const agendaOpen = useMemo(() => (data?.agenda ?? []).filter((a) => a.status !== "Parked"), [data]);
  const agendaParked = useMemo(() => (data?.agenda ?? []).filter((a) => a.status === "Parked"), [data]);
  const totalMinutes = agendaOpen.reduce((n, a) => n + (a.minutes ?? 0), 0);
  const unestimated = agendaOpen.filter((a) => a.minutes == null).length;

  const tasksByPerson = useMemo(() => {
    const groups: Record<string, TaskItem[]> = { marc: [], michiel: [], hadi: [], unassigned: [] };
    for (const t of data?.tasks ?? []) {
      if (t.owners.length === 0) groups.unassigned.push(t);
      for (const o of t.owners) (groups[o] ??= []).push(t);
    }
    return groups;
  }, [data]);

  function needsAttention(t: TaskItem): boolean {
    return t.status === "Waiting / Blocked" || (!!t.deadline && t.deadline < today);
  }

  if (authzLoading) {
    return (
      <>
        <TopNav />
        <main className="mx-auto max-w-7xl px-4 py-8 text-sm text-ink-soft">Loading…</main>
      </>
    );
  }
  if (!allowed) {
    return (
      <>
        <TopNav />
        <main className="mx-auto max-w-7xl px-4 py-8">
          <div className="alert-warning">The meeting cockpit is for the management team only.</div>
        </main>
      </>
    );
  }

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-7xl px-3 py-5 sm:px-4">
        {/* Kop */}
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="page-title">Meeting cockpit</h1>
            <p className="help-text mt-1">
              {data ? data.label : ""}
              {data?.meeting ? (
                <>
                  {" · "}
                  <a href={data.meeting.url} target="_blank" rel="noreferrer" className="underline decoration-brand-sage/60 underline-offset-2">
                    {data.meeting.name}
                  </a>
                  {data.meeting.date ? ` (${fmtDate(data.meeting.date)})` : ""}
                </>
              ) : data && !loading ? (
                <> · no meeting record for {data.window.start} – {data.window.end} yet</>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-brand-green/20 bg-surface p-0.5">
              {TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setType(t.key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    (type ?? data?.type) === t.key ? "bg-brand-green text-white" : "text-ink-soft hover:bg-brand-sand/40"
                  }`}
                  title={t.sub}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn-ghost" onClick={() => void load(type)} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </header>

        {data && (
          <div className="alert-warning mb-5 flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>Recording:</strong> start the Plaud and open with{" "}
              <em>“{data.label}”</em> so the transcript is routed correctly.
            </span>
            <span className="text-xs">
              Agenda: {agendaOpen.length} item{agendaOpen.length === 1 ? "" : "s"} · ~{totalMinutes} min
              {unestimated > 0 ? ` (+${unestimated} without estimate)` : ""}
            </span>
          </div>
        )}

        {error && <div className="alert-error mb-4">{error}</div>}

        <div className="grid gap-5 lg:grid-cols-12">
          {/* ---- Agenda ---- */}
          <section className="lg:col-span-5">
            <h2 className="section-title mb-3">Agenda</h2>
            {loading && !data ? (
              <div className="card text-sm text-ink-soft">Loading agenda…</div>
            ) : agendaOpen.length === 0 ? (
              <div className="card text-sm text-ink-soft">Nothing on the agenda for this {data?.type}. Add a topic below.</div>
            ) : (
              <ul className="space-y-2">
                {agendaOpen.map((a) => {
                  const open = !!openAgenda[a.id];
                  return (
                    <li key={a.id} className="card p-4">
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenAgenda((o) => ({ ...o, [a.id]: !open }))}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {a.status === "Scheduled" && <span className="badge-success">Scheduled</span>}
                            {a.ask && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${askClass(a.ask)}`}>{a.ask}</span>}
                            {a.domain && <span className="text-xs text-ink-soft">{a.domain}</span>}
                            {a.minutes != null && <span className="text-xs text-ink-soft">· {a.minutes} min</span>}
                            {a.raisedBy.length > 0 && (
                              <span className="text-xs text-ink-soft">· {a.raisedBy.map((k) => data?.people[k]?.short ?? "?").join(", ")}</span>
                            )}
                          </div>
                          <div className="mt-1 font-medium text-ink">{a.topic}</div>
                        </button>
                        <a href={a.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-ink-soft underline decoration-brand-sage/60 underline-offset-2">
                          Notion
                        </a>
                      </div>
                      {(open || a.whyNow || a.context) && (
                        <div className={`mt-2 text-sm text-ink-soft ${open ? "" : "line-clamp-2"}`}>
                          {a.whyNow}
                          {a.context && (
                            <>
                              {a.whyNow ? " " : ""}
                              <a href={a.context} target="_blank" rel="noreferrer" className="text-brand-green underline decoration-brand-sage/60 underline-offset-2">
                                Open context
                              </a>
                            </>
                          )}
                        </div>
                      )}
                      {open && (
                        <div className="mt-3 space-y-2 border-t border-brand-sage/40 pt-3">
                          <textarea
                            className="input"
                            rows={2}
                            placeholder="Outcome (decision, next step, or why parked) — optional"
                            value={outcomeDraft[a.id] ?? ""}
                            onChange={(e) => setOutcomeDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                          />
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="btn-primary" disabled={!!busy[a.id]} onClick={() => void agendaStatus(a, "Discussed")}>
                              Mark discussed
                            </button>
                            <button type="button" className="btn-secondary" disabled={!!busy[a.id]} onClick={() => void agendaStatus(a, "Parked")}>
                              Park
                            </button>
                            {a.status !== "Scheduled" ? (
                              <button type="button" className="btn-ghost" disabled={!!busy[a.id]} onClick={() => void agendaStatus(a, "Scheduled")}>
                                Must discuss today
                              </button>
                            ) : (
                              <button type="button" className="btn-ghost" disabled={!!busy[a.id]} onClick={() => void agendaStatus(a, "Proposed")}>
                                Unmark
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {agendaParked.length > 0 && (
              <div className="mt-3">
                <button type="button" className="text-sm text-ink-soft underline decoration-brand-sage/60 underline-offset-2" onClick={() => setShowParked((s) => !s)}>
                  {showParked ? "Hide" : "Show"} parked ({agendaParked.length})
                </button>
                {showParked && (
                  <ul className="mt-2 space-y-1">
                    {agendaParked.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-brand-sage/40 bg-surface px-3 py-2 text-sm">
                        <span className="min-w-0 truncate text-ink-soft">{a.topic}</span>
                        <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={!!busy[a.id]} onClick={() => void agendaStatus(a, "Proposed")}>
                          Back on agenda
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {data && (
              <QuickAdd
                key={type ?? data.type}
                type={(type ?? data.type) as MeetingType}
                asks={data.options.asks}
                domains={data.options.domains}
                me={me}
                onCreate={async (input) => {
                  const ok = await post("create", { action: "agenda.create", ...input });
                  if (ok) void load(type, true);
                  return ok;
                }}
              />
            )}
          </section>

          {/* ---- Taken per persoon ---- */}
          <section className="lg:col-span-7">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title">Open to-do&rsquo;s</h2>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-1.5 text-ink-soft">
                  <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} />
                  Only late / blocked
                </label>
                <label className="flex items-center gap-1.5 text-ink-soft">
                  <input type="checkbox" checked={showDrafts} onChange={(e) => setShowDrafts(e.target.checked)} />
                  Show drafts for review
                </label>
              </div>
            </div>

            {loading && !data ? (
              <div className="card text-sm text-ink-soft">Loading tasks…</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {[...PEOPLE_ORDER, "unassigned"].map((key) => {
                  const all = tasksByPerson[key] ?? [];
                  const drafts = all.filter((t) => t.status === "Drafts for review");
                  let list = all.filter((t) => OPEN_STATUSES.includes(t.status));
                  if (onlyAttention) list = list.filter(needsAttention);
                  list = [...list].sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)));
                  if (key === "unassigned" && all.length === 0) return null;
                  const name = key === "unassigned" ? "Unassigned" : data?.people[key]?.short ?? key;
                  const attention = all.filter((t) => OPEN_STATUSES.includes(t.status) && needsAttention(t)).length;
                  return (
                    <div key={key} className="card p-3">
                      <div className="mb-2 flex items-baseline justify-between">
                        <h3 className="font-heading text-base font-semibold text-brand-green">{name}</h3>
                        <span className="text-xs text-ink-soft">
                          {all.filter((t) => OPEN_STATUSES.includes(t.status)).length} open
                          {attention > 0 ? ` · ${attention} ⚠︎` : ""}
                          {drafts.length > 0 ? ` · ${drafts.length} draft${drafts.length === 1 ? "" : "s"}` : ""}
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {list.map((t) => (
                          <TaskRow key={t.id} t={t} attention={needsAttention(t)} busy={!!busy[t.id]} onStatus={(s) => void taskStatus(t, s)} />
                        ))}
                        {list.length === 0 && <li className="text-xs text-ink-soft">Nothing here.</li>}
                        {showDrafts && drafts.length > 0 && (
                          <>
                            <li className="pt-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Drafts for review</li>
                            {drafts.map((t) => (
                              <TaskRow key={t.id} t={t} attention={false} busy={!!busy[t.id]} onStatus={(s) => void taskStatus(t, s)} draft />
                            ))}
                          </>
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {data && (
          <p className="mt-6 text-xs text-ink-soft">
            Source of truth is Notion. Changes here write straight to the Tasks and Agenda items databases. Last refresh{" "}
            {new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(data.fetchedAt))}.
          </p>
        )}
      </main>
    </>
  );
}

function TaskRow({
  t,
  attention,
  busy,
  onStatus,
  draft = false,
}: {
  t: TaskItem;
  attention: boolean;
  busy: boolean;
  onStatus: (s: string) => void;
  draft?: boolean;
}) {
  const today = todayIso();
  const late = !!t.deadline && t.deadline < today;
  return (
    <li className={`rounded-lg border px-2.5 py-2 ${attention ? "border-accent-terracotta/40 bg-accent-terracotta/5" : "border-brand-sage/40 bg-surface"}`}>
      <div className="flex items-start justify-between gap-2">
        <a href={t.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 text-sm text-ink hover:underline">
          {t.task}
        </a>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
        {t.priority && <span>{t.priority.replace(/\s*\(.*\)/, "")}</span>}
        {t.domain && <span>· {t.domain}</span>}
        {t.deadline && <span className={late ? "font-semibold text-accent-terracotta" : ""}>· due {fmtDate(t.deadline)}</span>}
        {t.blocker && <span className="text-accent-terracotta">· {t.blocker}</span>}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {(draft ? ["To do", "Canceled"] : TOGGLE_STATUSES).map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy || t.status === s}
            onClick={() => onStatus(s)}
            className={`rounded-md border px-2 py-0.5 text-xs transition-colors disabled:cursor-default ${
              t.status === s ? statusClass(s) + " font-semibold" : "border-brand-green/10 bg-surface text-ink-soft hover:bg-brand-sand/40"
            }`}
          >
            {s === "Waiting / Blocked" ? "Blocked" : s === "Canceled" ? "Dismiss" : s === "To do" && draft ? "Accept" : s}
          </button>
        ))}
      </div>
    </li>
  );
}

function QuickAdd({
  type,
  asks,
  domains,
  me,
  onCreate,
}: {
  type: MeetingType;
  asks: string[];
  domains: string[];
  me: string | null;
  onCreate: (input: {
    topic: string;
    meetingType: MeetingType;
    ask: string | null;
    domain: string | null;
    whyNow: string;
    minutes: number | null;
    raisedBy: string | null;
  }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [ask, setAsk] = useState<string>("Discuss");
  const [domain, setDomain] = useState<string>("");
  const [whyNow, setWhyNow] = useState("");
  const [minutes, setMinutes] = useState<string>("");
  const [meetingType, setMeetingType] = useState<MeetingType>(type);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setSaving(true);
    const ok = await onCreate({
      topic: topic.trim(),
      meetingType,
      ask: ask || null,
      domain: domain || null,
      whyNow: whyNow.trim(),
      minutes: minutes ? Number(minutes) : null,
      raisedBy: me,
    });
    setSaving(false);
    if (ok) {
      setTopic("");
      setWhyNow("");
      setMinutes("");
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-secondary mt-3 w-full" onClick={() => setOpen(true)}>
        + Add a topic
      </button>
    );
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="card mt-3 space-y-2 p-4">
      <input className="input" placeholder="Topic — phrase it as the thing to resolve" value={topic} onChange={(e) => setTopic(e.target.value)} autoFocus />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select className="select-native text-sm" value={meetingType} onChange={(e) => setMeetingType(e.target.value as MeetingType)}>
          {TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <select className="select-native text-sm" value={ask} onChange={(e) => setAsk(e.target.value)}>
          {asks.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select className="select-native text-sm" value={domain} onChange={(e) => setDomain(e.target.value)}>
          <option value="">Domain…</option>
          {domains.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input className="input" type="number" min={1} placeholder="Minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </div>
      <textarea className="input" rows={2} placeholder="Why now? What is the question, why does it matter" value={whyNow} onChange={(e) => setWhyNow(e.target.value)} />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={saving || !topic.trim()}>
          {saving ? "Saving…" : "Add to agenda"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

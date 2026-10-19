"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { useLocation } from "@/contexts/LocationContext";
import { createClient } from "@/lib/supabase";

/**
 * Feedback the locations send with the Feedback button. Until 19-10-2026 it was only
 * stored, never shown, so Pijp's 13 points of 09-10 went unseen. New feedback also
 * mails Marc (edge function notify-feedback).
 */

type Status = "new" | "in_progress" | "done" | "wont_fix";

type FeedbackRow = {
  id: string;
  location_id: string | null;
  page: string | null;
  type: string;
  message: string;
  created_at: string;
  status: Status;
  response: string | null;
  resolved_at: string | null;
};

const STATUS_LABEL: Record<Status, string> = {
  new: "New",
  in_progress: "In progress",
  done: "Done",
  wont_fix: "Won't fix",
};

export default function AdminFeedbackPage() {
  const { locationOptions } = useLocation();
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: e } = await supabase
      .from("app_feedback")
      .select("id, location_id, page, type, message, created_at, status, response, resolved_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (e) setError(e.message);
    else {
      setRows((data as FeedbackRow[]) ?? []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const setStatus = async (row: FeedbackRow, status: Status) => {
    const supabase = createClient();
    const response = drafts[row.id] ?? row.response ?? null;
    const closed = status === "done" || status === "wont_fix";
    const { error: e } = await supabase
      .from("app_feedback")
      .update({
        status,
        response: response?.trim() ? response.trim() : null,
        resolved_at: closed ? new Date().toISOString() : null,
      })
      .eq("id", row.id);
    if (e) setError(e.message);
    else await load();
  };

  const locationName = (id: string | null) =>
    id == null ? "No location" : (locationOptions.find((l) => l.id === id)?.name ?? "?");

  const open = rows.filter((r) => r.status === "new" || r.status === "in_progress");
  const visible = showClosed ? rows : open;

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-3xl p-4">
        <Link href="/admin" className="text-sm text-blue-600">
          &larr; Admin
        </Link>
        <h1 className="mt-2 text-xl font-medium">Feedback from locations</h1>
        <p className="help-text mt-1">
          Everything sent with the Feedback button. {open.length} open. Mark an item done or
          won&apos;t fix once it is handled; the note is for the team.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Show closed items
        </label>

        {error && <p className="mt-3 text-sm text-accent-terracotta">{error}</p>}
        {loading ? (
          <p className="help-text mt-4">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="help-text mt-4">No open feedback.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {visible.map((r) => (
              <li key={r.id} className="rounded-lg border border-hairline p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                  <span className="font-medium text-ink">{locationName(r.location_id)}</span>
                  <span>{new Date(r.created_at).toLocaleDateString("en-GB")}</span>
                  <span>{r.page ?? "-"}</span>
                  <span className="rounded-full border border-hairline px-2">{r.type}</span>
                  <span className="rounded-full border border-hairline px-2">{STATUS_LABEL[r.status]}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{r.message}</p>
                <textarea
                  className="mt-2 w-full rounded border border-hairline bg-surface px-2 py-1 text-sm"
                  rows={2}
                  placeholder="Note / what was done"
                  value={drafts[r.id] ?? r.response ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {(Object.keys(STATUS_LABEL) as Status[])
                    .filter((s) => s !== r.status)
                    .map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void setStatus(r, s)}
                        className="rounded-md border border-hairline px-3 py-1 text-xs font-medium"
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

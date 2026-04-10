"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { createClient } from "@/lib/supabase";

type Row = {
  form_key: string;
  label: string;
  visible: boolean;
};

export default function FormVisibilityAdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: e } = await supabase
      .from("app_form_settings")
      .select("form_key, label, visible")
      .order("label");
    setLoading(false);
    if (e) {
      setError(e.message);
      setRows([]);
      return;
    }
    setRows((data as Row[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(key: string, next: boolean) {
    setSavingKey(key);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase
      .from("app_form_settings")
      .update({ visible: next, updated_at: new Date().toISOString() })
      .eq("form_key", key);
    setSavingKey(null);
    if (e) setError(e.message);
    else setRows((prev) => prev.map((r) => (r.form_key === key ? { ...r, visible: next } : r)));
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <TopNav />
      <main className="mx-auto max-w-lg px-4 py-8 pb-24">
        <Link
          href="/admin"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
        >
          ← Admin
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Form visibility</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Hidden forms no longer appear on the HACCP overview. Direct URLs show a short notice instead of the form.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <p className="mt-6 text-zinc-500">Loading…</p>
        ) : (
          <ul className="mt-6 space-y-2">
            {rows.map((r) => (
              <li
                key={r.form_key}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{r.label}</span>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={r.visible}
                    disabled={savingKey === r.form_key}
                    onChange={(e) => void toggle(r.form_key, e.target.checked)}
                    className="rounded border-zinc-300"
                  />
                  Visible
                </label>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

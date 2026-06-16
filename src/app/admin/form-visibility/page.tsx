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
    <div className="min-h-screen bg-background font-sans">
      <TopNav />
      <main className="mx-auto max-w-lg px-4 py-8 pb-24">
        <Link
          href="/admin"
          className="text-sm font-medium text-ink-soft/80 hover:text-ink"
        >
          ← Admin
        </Link>
        <h1 className="mt-4 page-title">Form visibility</h1>
        <p className="mt-2 help-text">
          Hidden forms no longer appear on the HACCP overview. Direct URLs show a short notice instead of the form.
        </p>

        {error && (
          <div className="mt-4 alert-error rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <p className="mt-6 text-ink-soft/80">Loading…</p>
        ) : (
          <ul className="mt-6 space-y-2">
            {rows.map((r) => (
              <li
                key={r.form_key}
                className="flex items-center justify-between gap-3 card px-4 py-3"
              >
                <span className="text-sm font-medium text-ink">{r.label}</span>
                <label className="flex cursor-pointer items-center gap-2 help-text">
                  <input
                    type="checkbox"
                    checked={r.visible}
                    disabled={savingKey === r.form_key}
                    onChange={(e) => void toggle(r.form_key, e.target.checked)}
                    className="rounded border-brand-green/15"
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

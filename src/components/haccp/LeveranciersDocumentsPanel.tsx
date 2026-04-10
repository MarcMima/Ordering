"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { HaccpLeverancierRow } from "@/lib/haccp/types";

const BUCKET = "haccp-supplier-docs";

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 180);
}

export function LeveranciersDocumentsPanel({ storeId }: { storeId: number }) {
  const [rows, setRows] = useState<HaccpLeverancierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("haccp_leveranciers")
      .select("id, store_id, naam, audit_document_path, created_at, updated_at")
      .eq("store_id", storeId)
      .order("naam", { ascending: true });
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setRows((data as HaccpLeverancierRow[]) ?? []);
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addSupplier() {
    const naam = newName.trim();
    if (!naam) return;
    setAdding(true);
    setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("haccp_leveranciers")
      .insert({ store_id: storeId, naam })
      .select("id, store_id, naam, audit_document_path, created_at, updated_at")
      .single();
    setAdding(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setNewName("");
    if (data) setRows((prev) => [...prev, data as HaccpLeverancierRow].sort((a, b) => a.naam.localeCompare(b.naam)));
  }

  async function openDocument(path: string) {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      setErr(error?.message ?? "Could not open file.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function onUpload(supplier: HaccpLeverancierRow, file: File | null) {
    if (!file) return;
    setUploadingId(supplier.id);
    setErr(null);
    const supabase = createClient();
    const path = `${storeId}/${supplier.id}/${sanitizeFileName(file.name)}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: true,
    });
    if (upErr) {
      setErr(upErr.message);
      setUploadingId(null);
      return;
    }

    const { error: dbErr } = await supabase
      .from("haccp_leveranciers")
      .update({ audit_document_path: path, updated_at: new Date().toISOString() })
      .eq("id", supplier.id);

    setUploadingId(null);
    if (dbErr) {
      setErr(dbErr.message);
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.id === supplier.id ? { ...r, audit_document_path: path } : r))
    );
  }

  return (
    <div className="space-y-6">
      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {err}
        </div>
      )}

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Suppliers complete their own paperwork; upload the returned or signed document here for audits. Use PDF or
        images.
      </p>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
        <label className="min-w-[12rem] flex-1 text-sm">
          <span className="mb-1 block font-medium text-zinc-800 dark:text-zinc-200">Add supplier</span>
          <input
            className="input w-full"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addSupplier();
              }
            }}
          />
        </label>
        <button
          type="button"
          disabled={adding || !newName.trim()}
          onClick={() => void addSupplier()}
          className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {adding ? "Adding…" : "Add"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No suppliers yet. Add one above.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/40">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-[8rem] flex-1 font-medium text-zinc-900 dark:text-zinc-50">{r.naam}</span>
              <label className="text-sm">
                <span className="sr-only">Upload document for {r.naam}</span>
                <input
                  type="file"
                  accept=".pdf,image/*,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="max-w-[14rem] text-xs text-zinc-600 file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-sm dark:text-zinc-400 dark:file:bg-zinc-700"
                  disabled={uploadingId === r.id}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    void onUpload(r, f ?? null);
                  }}
                />
              </label>
              {r.audit_document_path ? (
                <button
                  type="button"
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => void openDocument(r.audit_document_path!)}
                >
                  Open document
                </button>
              ) : (
                <span className="text-xs text-zinc-400">No file yet</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

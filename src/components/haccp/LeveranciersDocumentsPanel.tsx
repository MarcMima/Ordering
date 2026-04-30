"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { HaccpLeverancierRow } from "@/lib/haccp/types";
import type { Supplier } from "@/lib/types";

const BUCKET = "haccp-supplier-docs";

const HACCP_LEVERANCIERS_SELECT =
  "id, store_id, naam, audit_document_path, audit_document_paths, created_at, updated_at";

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 180);
}

function normName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Resolved list of storage paths (legacy single path + array). */
export function documentPathsForSupplier(row: HaccpLeverancierRow | null): string[] {
  if (!row) return [];
  const arr = row.audit_document_paths;
  if (Array.isArray(arr) && arr.length > 0) {
    return [...new Set(arr.filter(Boolean) as string[])];
  }
  if (row.audit_document_path) return [row.audit_document_path];
  return [];
}

function fileLabel(path: string): string {
  const seg = path.split("/").filter(Boolean);
  return seg[seg.length - 1] ?? path;
}

export function LeveranciersDocumentsPanel({
  storeId,
  locationId,
}: {
  storeId: number;
  locationId: string;
}) {
  const [masterSuppliers, setMasterSuppliers] = useState<Pick<Supplier, "id" | "name">[]>([]);
  const [haccpRows, setHaccpRows] = useState<HaccpLeverancierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [removingPath, setRemovingPath] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!locationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    const supabase = createClient();

    const [supRes, haccpRes] = await Promise.all([
      supabase.from("suppliers").select("id, name").eq("location_id", locationId).order("name", { ascending: true }),
      supabase
        .from("haccp_leveranciers")
        .select(HACCP_LEVERANCIERS_SELECT)
        .eq("store_id", storeId)
        .order("naam", { ascending: true }),
    ]);

    setLoading(false);
    if (supRes.error) {
      setErr(supRes.error.message);
      return;
    }
    if (haccpRes.error) {
      setErr(haccpRes.error.message);
      return;
    }

    setMasterSuppliers((supRes.data as Pick<Supplier, "id" | "name">[]) ?? []);
    setHaccpRows((haccpRes.data as HaccpLeverancierRow[]) ?? []);
  }, [storeId, locationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const haccpByNorm = useMemo(() => {
    const m = new Map<string, HaccpLeverancierRow>();
    for (const h of haccpRows) {
      m.set(normName(h.naam), h);
    }
    return m;
  }, [haccpRows]);

  const orphanHaccp = useMemo(() => {
    const masterNorms = new Set(masterSuppliers.map((s) => normName(s.name)));
    return haccpRows.filter((h) => !masterNorms.has(normName(h.naam)));
  }, [haccpRows, masterSuppliers]);

  async function ensureHaccpRow(displayName: string): Promise<HaccpLeverancierRow | null> {
    const key = normName(displayName);
    const existing = haccpByNorm.get(key);
    if (existing) return existing;

    setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("haccp_leveranciers")
      .insert({ store_id: storeId, naam: displayName.trim() })
      .select(HACCP_LEVERANCIERS_SELECT)
      .single();

    if (error) {
      setErr(error.message);
      return null;
    }
    const row = data as HaccpLeverancierRow;
    setHaccpRows((prev) => [...prev, row].sort((a, b) => a.naam.localeCompare(b.naam)));
    return row;
  }

  async function addExtraSupplier() {
    const naam = newName.trim();
    if (!naam) return;
    if (haccpByNorm.has(normName(naam))) {
      setErr("That supplier already has a document row.");
      return;
    }
    setAdding(true);
    setErr(null);
    const row = await ensureHaccpRow(naam);
    setAdding(false);
    if (row) setNewName("");
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

  async function onUpload(haccp: HaccpLeverancierRow, file: File | null) {
    if (!file) return;
    setUploadingId(haccp.id);
    setErr(null);
    const supabase = createClient();
    const path = `${storeId}/${haccp.id}/${sanitizeFileName(file.name)}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: true,
    });
    if (upErr) {
      setErr(upErr.message);
      setUploadingId(null);
      return;
    }

    const prev = documentPathsForSupplier(haccp);
    if (prev.includes(path)) {
      setUploadingId(null);
      return;
    }
    const nextPaths = [...prev, path];

    const { error: dbErr } = await supabase
      .from("haccp_leveranciers")
      .update({
        audit_document_paths: nextPaths,
        audit_document_path: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", haccp.id);

    setUploadingId(null);
    if (dbErr) {
      setErr(dbErr.message);
      return;
    }
    setHaccpRows((prevRows) =>
      prevRows.map((r) =>
        r.id === haccp.id
          ? { ...r, audit_document_paths: nextPaths, audit_document_path: null }
          : r
      )
    );
  }

  async function removeDocument(haccp: HaccpLeverancierRow, path: string) {
    setRemovingPath(path);
    setErr(null);
    const supabase = createClient();
    await supabase.storage.from(BUCKET).remove([path]);

    const prev = documentPathsForSupplier(haccp);
    const nextPaths = prev.filter((p) => p !== path);
    const { error: dbErr } = await supabase
      .from("haccp_leveranciers")
      .update({
        audit_document_paths: nextPaths.length > 0 ? nextPaths : null,
        audit_document_path: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", haccp.id);

    setRemovingPath(null);
    if (dbErr) {
      setErr(dbErr.message);
      return;
    }
    setHaccpRows((prevRows) =>
      prevRows.map((r) =>
        r.id === haccp.id
          ? { ...r, audit_document_paths: nextPaths.length > 0 ? nextPaths : null, audit_document_path: null }
          : r
      )
    );
  }

  async function handleUploadForMaster(supplierName: string) {
    const row =
      haccpByNorm.get(normName(supplierName)) ?? (await ensureHaccpRow(supplierName));
    return row;
  }

  return (
    <div className="space-y-6">
      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {err}
        </div>
      )}

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Suppliers come from your location&apos;s ordering list (Admin → Suppliers). You can attach several files per
        supplier — for example a completed questionnaire and a food safety certificate (FSSC, etc.). Use PDF or images.
      </p>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : !locationId ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">Choose a location in the header first.</p>
      ) : masterSuppliers.length === 0 && orphanHaccp.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-400">
          <p>No suppliers for this location yet.</p>
          <p className="mt-2">
            Add them under{" "}
            <Link href="/admin" className="font-medium text-zinc-900 underline dark:text-zinc-100">
              Admin → Suppliers
            </Link>
            , then return here. You can also add a one-off name below for a supplier that is not in the ordering list.
          </p>
        </div>
      ) : null}

      {!loading && locationId && (masterSuppliers.length > 0 || orphanHaccp.length > 0) && (
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/40">
          {masterSuppliers.map((s) => {
            const h = haccpByNorm.get(normName(s.name)) ?? null;
            const paths = documentPathsForSupplier(h);
            return (
              <SupplierDocRow
                key={s.id}
                label={s.name}
                haccp={h ?? null}
                paths={paths}
                uploadingId={uploadingId}
                removingPath={removingPath}
                onPickFile={async (file) => {
                  const row = await handleUploadForMaster(s.name);
                  if (row) await onUpload(row, file);
                }}
                onOpenPath={(p) => void openDocument(p)}
                onRemovePath={(p) => h && void removeDocument(h, p)}
                isOrphan={false}
              />
            );
          })}
          {orphanHaccp.map((h) => (
            <SupplierDocRow
              key={h.id}
              label={h.naam}
              haccp={h}
              paths={documentPathsForSupplier(h)}
              uploadingId={uploadingId}
              removingPath={removingPath}
              onPickFile={async (file) => {
                await onUpload(h, file);
              }}
              onOpenPath={(p) => void openDocument(p)}
              onRemovePath={(p) => void removeDocument(h, p)}
              isOrphan
            />
          ))}
        </ul>
      )}

      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 p-4 dark:border-zinc-600 dark:bg-zinc-900/40">
        <p className="mb-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Supplier not in the list above?
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[12rem] flex-1 text-sm">
            <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Name</span>
            <input
              className="input w-full"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. one-off delivery"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addExtraSupplier();
                }
              }}
            />
          </label>
          <button
            type="button"
            disabled={adding || !newName.trim()}
            onClick={() => void addExtraSupplier()}
            className="rounded-xl bg-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-900 disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-100"
          >
            {adding ? "Adding…" : "Add row"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SupplierDocRow({
  label,
  haccp,
  paths,
  uploadingId,
  removingPath,
  onPickFile,
  onOpenPath,
  onRemovePath,
  isOrphan,
}: {
  label: string;
  haccp: HaccpLeverancierRow | null;
  paths: string[];
  uploadingId: string | null;
  removingPath: string | null;
  onPickFile: (file: File) => Promise<void>;
  onOpenPath: (path: string) => void;
  onRemovePath: (path: string) => void;
  isOrphan?: boolean;
}) {
  const busy = haccp != null && uploadingId === haccp.id;

  return (
    <li className="px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-[10rem]">
          <span className="font-medium text-zinc-900 dark:text-zinc-50">{label}</span>
          {isOrphan && <span className="ml-2 text-xs text-zinc-400">(extra)</span>}
        </div>

        <div className="flex flex-1 flex-col gap-2 sm:items-end">
          <label className="text-sm sm:text-right">
            <span className="mb-1 block text-zinc-500 sm:hidden">Add document</span>
            <input
              type="file"
              accept=".pdf,image/*,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="max-w-full text-xs text-zinc-600 file:mr-2 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-sm dark:text-zinc-400 dark:file:bg-zinc-700 sm:max-w-[16rem]"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onPickFile(f);
              }}
            />
          </label>
        </div>
      </div>

      {paths.length > 0 ? (
        <ul className="mt-3 space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-700/80">
          {paths.map((p) => (
            <li
              key={p}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300" title={fileLabel(p)}>
                {fileLabel(p)}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => onOpenPath(p)}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  disabled={removingPath === p}
                  onClick={() => onRemovePath(p)}
                >
                  {removingPath === p ? "…" : "Remove"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-zinc-400">
          {haccp ? "No documents yet — upload one or more files above." : "Upload creates the supplier link."}
        </p>
      )}
    </li>
  );
}

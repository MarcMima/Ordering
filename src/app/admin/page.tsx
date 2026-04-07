"use client";

import { useState, useEffect, useMemo, Fragment, useRef, useCallback } from "react";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { useLocation } from "@/contexts/LocationContext";
import {
  buildBaseQuantityTemplateCsv,
  matchCsvToLocationPrepUpdates,
  parseBaseQuantityCsvText,
} from "@/lib/baseQuantityCsv";
import { createClient } from "@/lib/supabase";
import { formatDecimal2 } from "@/lib/format";
import type { Location, Supplier, PrepItem, RawIngredient, PrepItemIngredient } from "@/lib/types";

const DAYS = [
  { value: 0, label: "Monday (1)" },
  { value: 1, label: "Tuesday (2)" },
  { value: 2, label: "Wednesday (3)" },
  { value: 3, label: "Thursday (4)" },
  { value: 4, label: "Friday (5)" },
  { value: 5, label: "Saturday (6)" },
  { value: 6, label: "Sunday (7)" },
];

type Section = "locations" | "suppliers" | "products" | "ingredients" | "recipes";

type RawIngredientWithLocation = RawIngredient & { location_name?: string };

export default function AdminPage() {
  const { locationId: contextLocationId, locationOptions } = useLocation();
  const [section, setSection] = useState<Section>("locations");
  const [locations, setLocations] = useState<Location[]>([]);
  const [suppliers, setSuppliers] = useState<(Supplier & { location_name?: string })[]>([]);
  const [prepItems, setPrepItems] = useState<PrepItem[]>([]);
  const [rawIngredients, setRawIngredients] = useState<RawIngredientWithLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [locationsLoading, setLocationsLoading] = useState(false);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [ingredientsLoading, setIngredientsLoading] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    try {
      const [locRes, supRes, prepRes, ingRes] = await Promise.all([
        supabase.from("locations").select("*").order("name"),
        supabase.from("suppliers").select("*, locations(name)").order("name"),
        supabase.from("prep_items").select("*").order("name"),
        supabase.from("raw_ingredients").select("*, locations(name)").order("name"),
      ]);
      if (locRes.error) throw locRes.error;
      if (supRes.error) throw supRes.error;
      if (prepRes.error) throw prepRes.error;
      if (ingRes.error) throw ingRes.error;
      setLocations((locRes.data as Location[]) ?? []);
      setSuppliers(
        ((supRes.data as (Supplier & { locations?: { name: string } | null })[]) ?? []).map((s) => ({
          ...s,
          location_name: s.locations?.name ?? "",
        }))
      );
      setPrepItems((prepRes.data as PrepItem[]) ?? []);
      setRawIngredients(
        ((ingRes.data as (RawIngredient & { locations?: { name: string } | null })[]) ?? []).map((r) => ({
          ...r,
          location_name: r.locations?.name ?? "",
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  const contextLocationName = locationOptions.find((l) => l.id === contextLocationId)?.name ?? "";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <TopNav />
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
          <nav className="p-3 space-y-0.5">
            <button
              onClick={() => setSection("locations")}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                section === "locations"
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-600 dark:text-zinc-100"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              Locations
            </button>
            <button
              onClick={() => setSection("suppliers")}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                section === "suppliers"
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-600 dark:text-zinc-100"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              Suppliers
            </button>
            <button
              onClick={() => setSection("products")}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                section === "products"
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-600 dark:text-zinc-100"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              Products
            </button>
            <button
              onClick={() => setSection("ingredients")}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                section === "ingredients"
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-600 dark:text-zinc-100"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              Ingredients
            </button>
            <button
              onClick={() => setSection("recipes")}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                section === "recipes"
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-600 dark:text-zinc-100"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              Recipes
            </button>
          </nav>
          <div className="border-t border-zinc-200 p-3 dark:border-zinc-700">
            <Link
              href="/dashboard"
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
            >
              ← Dashboard
            </Link>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
          {loading ? (
            <p className="text-zinc-500">Loading…</p>
          ) : section === "locations" ? (
            <LocationsSection
              locations={locations}
              prepItems={prepItems}
              onReload={loadAll}
              loading={locationsLoading}
              setLoading={setLocationsLoading}
            />
          ) : section === "suppliers" ? (
            <SuppliersSection
              suppliers={suppliers.filter((s) => s.location_id === contextLocationId)}
              locations={locations}
              currentLocationId={contextLocationId}
              currentLocationName={contextLocationName}
              onReload={loadAll}
              loading={suppliersLoading}
              setLoading={setSuppliersLoading}
            />
          ) : section === "ingredients" ? (
            <IngredientsSection
              rawIngredients={rawIngredients.filter((r) => r.location_id === contextLocationId)}
              locations={locations}
              currentLocationId={contextLocationId}
              currentLocationName={contextLocationName}
              onReload={loadAll}
              loading={ingredientsLoading}
              setLoading={setIngredientsLoading}
            />
          ) : section === "recipes" ? (
            <RecipesSection
              currentLocationId={contextLocationId}
              currentLocationName={contextLocationName}
              rawIngredientsForLocation={rawIngredients.filter((r) => r.location_id === contextLocationId)}
            />
          ) : (
            <ProductsSection
              prepItems={prepItems}
              onReload={loadAll}
              loading={productsLoading}
              setLoading={setProductsLoading}
            />
          )}
        </main>
      </div>
    </div>
  );
}

type LocationPrepItemRow = {
  id: string;
  location_id: string;
  prep_item_id: string;
  base_quantity?: number | null;
  prep_items: { id: string; name: string } | null;
};

function PrepItemsAtLocationPanel({
  locationPrepItems,
  prepItems,
  productsLoading,
  csvBusy,
  addProductId,
  setAddProductId,
  onOpenCsvPicker,
  onAddProduct,
  onRemoveProduct,
  onBaseQuantityBlur,
  onDownloadCsvTemplate,
}: {
  locationPrepItems: LocationPrepItemRow[];
  prepItems: PrepItem[];
  productsLoading: boolean;
  csvBusy: boolean;
  addProductId: string;
  setAddProductId: (v: string) => void;
  onOpenCsvPicker: () => void;
  onAddProduct: () => void;
  onRemoveProduct: (rowId: string) => void;
  onBaseQuantityBlur: (rowId: string, value: string) => void | Promise<void>;
  onDownloadCsvTemplate: () => void;
}) {
  return (
    <>
      <p className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">
        <strong>Base quantity at full-capacity revenue</strong> — same unit as stocktake/prep (often g). Daily need =
        this × (today revenue ÷ full capacity revenue). Edit below or use CSV.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onDownloadCsvTemplate}
          disabled={locationPrepItems.length === 0 || productsLoading || csvBusy}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200"
        >
          Download CSV
        </button>
        <button
          type="button"
          onClick={onOpenCsvPicker}
          disabled={productsLoading || csvBusy}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200"
        >
          {csvBusy ? "Importing…" : "Upload CSV"}
        </button>
        <span className="text-xs text-zinc-500">
          Columns: <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">product_name,base_quantity</code> or{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">prep_item_id,base_quantity</code>
        </span>
      </div>
      {productsLoading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <>
          <ul className="mb-3 space-y-2 text-sm">
            {locationPrepItems.length === 0 ? (
              <li className="text-zinc-500">No products linked yet.</li>
            ) : (
              locationPrepItems.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-2 rounded-md border border-zinc-100 p-2 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-700"
                >
                  <span className="min-w-0 font-medium text-zinc-900 dark:text-zinc-100">
                    {row.prep_items?.name ?? row.prep_item_id}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                      Base qty
                      <input
                        key={`${row.id}-${row.base_quantity ?? 1}`}
                        type="number"
                        step="any"
                        min={0}
                        defaultValue={row.base_quantity ?? 1}
                        onBlur={(e) => void onBaseQuantityBlur(row.id, e.target.value)}
                        className="w-28 rounded border border-zinc-300 px-2 py-1 text-sm tabular-nums dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        aria-label={`Base quantity for ${row.prep_items?.name ?? "product"}`}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => onRemoveProduct(row.id)}
                      className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 dark:border-red-800 dark:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={addProductId}
              onChange={(e) => setAddProductId(e.target.value)}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="">Add a product…</option>
              {prepItems
                .filter((p) => !locationPrepItems.some((r) => r.prep_item_id === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={onAddProduct}
              disabled={!addProductId || productsLoading}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Add
            </button>
          </div>
        </>
      )}
    </>
  );
}

function LocationsSection({
  locations,
  prepItems,
  onReload,
  loading,
  setLoading,
}: {
  locations: Location[];
  prepItems: PrepItem[];
  onReload: () => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
}) {
  const [editing, setEditing] = useState<Location | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    full_capacity_revenue: "",
    ordering_evening_day_fraction: "",
  });
  const [managingProductsLocationId, setManagingProductsLocationId] = useState<string | null>(null);
  const [locationPrepItems, setLocationPrepItems] = useState<LocationPrepItemRow[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [addProductId, setAddProductId] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const reloadLocationPrepItems = useCallback(async () => {
    if (!managingProductsLocationId) {
      setLocationPrepItems([]);
      return;
    }
    setProductsLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("location_prep_items")
      .select("id, location_id, prep_item_id, base_quantity, prep_items(id, name)")
      .eq("location_id", managingProductsLocationId)
      .order("prep_item_id");
    if (error) {
      setLocationPrepItems([]);
    } else {
      setLocationPrepItems((data as unknown as LocationPrepItemRow[]) ?? []);
    }
    setProductsLoading(false);
  }, [managingProductsLocationId]);

  useEffect(() => {
    void reloadLocationPrepItems();
  }, [reloadLocationPrepItems]);

  async function handleAddProductToLocation() {
    if (!managingProductsLocationId || !addProductId) return;
    setProductsLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("location_prep_items")
      .insert({ location_id: managingProductsLocationId, prep_item_id: addProductId });
    if (error) alert(error.message);
    else setAddProductId("");
    await reloadLocationPrepItems();
  }

  async function handleBaseQuantityBlur(rowId: string, value: string) {
    const trimmed = value.trim();
    const n = trimmed === "" ? 1 : parseFloat(trimmed.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      await reloadLocationPrepItems();
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("location_prep_items").update({ base_quantity: n }).eq("id", rowId);
    if (error) {
      alert(error.message);
      await reloadLocationPrepItems();
      return;
    }
    setLocationPrepItems((prev) => prev.map((r) => (r.id === rowId ? { ...r, base_quantity: n } : r)));
  }

  function handleDownloadCsvTemplate() {
    const csv = buildBaseQuantityTemplateCsv(locationPrepItems);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    const loc = locations.find((l) => l.id === managingProductsLocationId);
    const safe = (loc?.name ?? "location").replace(/[^\w\-]+/g, "-");
    a.href = URL.createObjectURL(blob);
    a.download = `base-quantities-${safe}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleCsvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !managingProductsLocationId) return;
    if (locationPrepItems.length === 0) {
      alert("No linked products to update. Add products first.");
      return;
    }
    setCsvBusy(true);
    try {
      const text = await file.text();
      const { rows, lineErrors, headerSkipped } = parseBaseQuantityCsvText(text);
      if (rows.length === 0) {
        alert(
          lineErrors.length
            ? `Could not read any data rows.\n${lineErrors.join("\n")}`
            : "CSV has no data rows."
        );
        return;
      }
      const { updates, unmatched } = matchCsvToLocationPrepUpdates(rows, locationPrepItems);
      if (updates.length === 0) {
        alert(
          `No rows matched linked products at this location.${
            unmatched.length
              ? `\n\nUnmatched (check name spelling or use prep_item_id UUID):\n${unmatched.slice(0, 25).join("\n")}${unmatched.length > 25 ? "\n…" : ""}`
              : ""
          }${lineErrors.length ? `\n\n${lineErrors.join("\n")}` : ""}`
        );
        return;
      }
      const supabase = createClient();
      const results = await Promise.all(
        updates.map((u) =>
          supabase.from("location_prep_items").update({ base_quantity: u.base_quantity }).eq("id", u.id)
        )
      );
      const firstErr = results.find((r) => r.error)?.error;
      if (firstErr) {
        alert(firstErr.message);
        await reloadLocationPrepItems();
        return;
      }
      await reloadLocationPrepItems();
      const parts = [`Updated ${updates.length} row(s).`];
      if (headerSkipped) parts.push("Header row was skipped.");
      if (unmatched.length) {
        parts.push(
          `Not matched (${unmatched.length}): ${unmatched.slice(0, 12).join(", ")}${unmatched.length > 12 ? "…" : ""}`
        );
      }
      if (lineErrors.length) parts.push(`Notes: ${lineErrors.slice(0, 6).join("; ")}`);
      alert(parts.join("\n"));
    } finally {
      setCsvBusy(false);
    }
  }

  async function handleRemoveProductFromLocation(rowId: string) {
    if (!managingProductsLocationId) return;
    setProductsLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("location_prep_items").delete().eq("id", rowId);
    if (error) alert(error.message);
    else setLocationPrepItems((prev) => prev.filter((r) => r.id !== rowId));
    setProductsLoading(false);
  }

  async function handleSave(isAdd: boolean) {
    setLoading(true);
    const supabase = createClient();
    try {
      const eveRaw = form.ordering_evening_day_fraction.trim();
      const eveNum = eveRaw === "" ? null : Number(eveRaw.replace(",", "."));
      const payload = {
        name: form.name,
        full_capacity_revenue: form.full_capacity_revenue ? Number(form.full_capacity_revenue) : null,
        ordering_evening_day_fraction:
          eveNum != null && Number.isFinite(eveNum) && eveNum >= 0 ? eveNum : null,
      };
      if (isAdd) {
        const { error } = await supabase.from("locations").insert(payload);
        if (error) throw error;
        setAdding(false);
        setForm({ name: "", full_capacity_revenue: "", ordering_evening_day_fraction: "" });
      } else {
        if (!editing) return;
        const { error } = await supabase.from("locations").update(payload).eq("id", editing.id);
        if (error) throw error;
        setEditing(null);
      }
      onReload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <input
        ref={csvFileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleCsvFileChange}
      />
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Locations</h1>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Link products for Stocktake: per location click <strong>Manage products</strong> (green or black button). There you can set{" "}
        <strong>base quantities</strong> (full-capacity consumption) per product and import/export CSV. See{" "}
        <code className="text-xs">docs/BASE_QUANTITY_CSV.md</code>.
      </p>
      {adding ? (
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="mb-3 text-sm font-medium">New location</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <input
              type="number"
              step="any"
              placeholder="Full capacity revenue (€)"
              value={form.full_capacity_revenue}
              onChange={(e) => setForm((f) => ({ ...f, full_capacity_revenue: e.target.value }))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <input
              type="number"
              step="any"
              min={0}
              placeholder="Evening fraction of 1 day (e.g. 0.66)"
              title="Once per order: need × (this + cover days). Evening slice only, e.g. 0.66 = 66% of one day after ~17:00"
              value={form.ordering_evening_day_fraction}
              onChange={(e) => setForm((f) => ({ ...f, ordering_evening_day_fraction: e.target.value }))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 sm:col-span-2"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => handleSave(true)}
              disabled={!form.name.trim() || loading}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Save
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setForm({ name: "", full_capacity_revenue: "", ordering_evening_day_fraction: "" });
              }}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mb-4 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add location
        </button>
      )}

      {/* Mobile: cards so "Manage products" is always visible */}
      <div className="mb-6 sm:hidden">
        {locations.length === 0 ? (
          <p className="text-sm text-zinc-500">No locations yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {locations.map((loc) => (
              <div
                key={loc.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <p className="font-medium text-zinc-900 dark:text-zinc-100">{loc.name}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Full capacity revenue: {loc.full_capacity_revenue ?? "—"}
                  <br />
                  Evening order fraction:{" "}
                  {loc.ordering_evening_day_fraction != null && Number.isFinite(loc.ordering_evening_day_fraction)
                    ? formatDecimal2(loc.ordering_evening_day_fraction)
                    : "0.7 (default)"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setEditing(loc);
                      setForm({
                        name: loc.name,
                        full_capacity_revenue: loc.full_capacity_revenue != null ? String(loc.full_capacity_revenue) : "",
                        ordering_evening_day_fraction:
                          loc.ordering_evening_day_fraction != null &&
                          Number.isFinite(loc.ordering_evening_day_fraction)
                            ? String(loc.ordering_evening_day_fraction)
                            : "",
                      });
                    }}
                    className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-600 dark:text-zinc-300"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() =>
                      setManagingProductsLocationId((prev) => (prev === loc.id ? null : loc.id))
                    }
                    className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    {managingProductsLocationId === loc.id ? "Close products" : "Manage products"}
                  </button>
                </div>
                {managingProductsLocationId === loc.id && (
                  <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
                    <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Prep items at this location
                    </h3>
                    <PrepItemsAtLocationPanel
                      locationPrepItems={locationPrepItems}
                      prepItems={prepItems}
                      productsLoading={productsLoading}
                      csvBusy={csvBusy}
                      addProductId={addProductId}
                      setAddProductId={setAddProductId}
                      onOpenCsvPicker={() => csvFileInputRef.current?.click()}
                      onAddProduct={handleAddProductToLocation}
                      onRemoveProduct={handleRemoveProductFromLocation}
                      onBaseQuantityBlur={handleBaseQuantityBlur}
                      onDownloadCsvTemplate={handleDownloadCsvTemplate}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800 sm:block">
        <table className="min-w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Name</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Full capacity revenue</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">
                Evening fraction
              </th>
              <th className="whitespace-nowrap px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300 sm:text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {locations.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                  No locations yet.
                </td>
              </tr>
            ) : (
              locations.map((loc) => (
                <Fragment key={loc.id}>
                  {editing?.id === loc.id ? (
                    <tr key={loc.id} className="border-t border-zinc-200 dark:border-zinc-700">
                    <td colSpan={4} className="px-4 py-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          className="rounded border px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <input
                          type="number"
                          step="any"
                          value={form.full_capacity_revenue}
                          onChange={(e) => setForm((f) => ({ ...f, full_capacity_revenue: e.target.value }))}
                          className="rounded border px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <input
                          type="number"
                          step="any"
                          min={0}
                          title="Once: order need includes daily × (this + full cover days). Empty = default 2/3"
                          placeholder="Evening fraction (e.g. 0.66)"
                          value={form.ordering_evening_day_fraction}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, ordering_evening_day_fraction: e.target.value }))
                          }
                          className="rounded border px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 sm:col-span-2"
                        />
                      </div>
                      <p className="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Link products for Stocktake →
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(null);
                            setForm({ name: "", full_capacity_revenue: "", ordering_evening_day_fraction: "" });
                            setManagingProductsLocationId(loc.id);
                          }}
                          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                        >
                          Manage products
                        </button>
                        <button
                          onClick={() => handleSave(false)}
                          disabled={loading}
                          className="rounded bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditing(null);
                            setForm({ name: "", full_capacity_revenue: "", ordering_evening_day_fraction: "" });
                          }}
                          className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={loc.id} className="border-t border-zinc-200 dark:border-zinc-700">
                    <td className="px-4 py-2 font-medium">{loc.name}</td>
                    <td className="px-4 py-2">{loc.full_capacity_revenue ?? "—"}</td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                      {loc.ordering_evening_day_fraction != null && Number.isFinite(loc.ordering_evening_day_fraction)
                        ? formatDecimal2(loc.ordering_evening_day_fraction)
                        : "0.7"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <button
                          onClick={() => {
                            setEditing(loc);
                            setForm({
                              name: loc.name,
                              full_capacity_revenue: loc.full_capacity_revenue != null ? String(loc.full_capacity_revenue) : "",
                              ordering_evening_day_fraction:
                                loc.ordering_evening_day_fraction != null &&
                                Number.isFinite(loc.ordering_evening_day_fraction)
                                  ? String(loc.ordering_evening_day_fraction)
                                  : "",
                            });
                          }}
                          className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() =>
                            setManagingProductsLocationId((prev) =>
                              prev === loc.id ? null : loc.id
                            )
                          }
                          className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                          {managingProductsLocationId === loc.id ? "Close products" : "Manage products"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                  {managingProductsLocationId === loc.id && (
                    <tr key={`${loc.id}-products`} className="border-t border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/50">
                      <td colSpan={4} className="px-4 py-3">
                        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
                          <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            Prep items at this location (for stocktake)
                          </h3>
                          <PrepItemsAtLocationPanel
                            locationPrepItems={locationPrepItems}
                            prepItems={prepItems}
                            productsLoading={productsLoading}
                            csvBusy={csvBusy}
                            addProductId={addProductId}
                            setAddProductId={setAddProductId}
                            onOpenCsvPicker={() => csvFileInputRef.current?.click()}
                            onAddProduct={handleAddProductToLocation}
                            onRemoveProduct={handleRemoveProductFromLocation}
                            onBaseQuantityBlur={handleBaseQuantityBlur}
                            onDownloadCsvTemplate={handleDownloadCsvTemplate}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IngredientsSection({
  rawIngredients,
  locations,
  currentLocationId,
  currentLocationName,
  onReload,
  loading,
  setLoading,
}: {
  rawIngredients: RawIngredientWithLocation[];
  locations: Location[];
  currentLocationId: string;
  currentLocationName: string;
  onReload: () => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    location_id: "",
    name: "",
    unit: "",
    order_interval_days: "",
    stocktake_visible: true,
    stocktake_day_of_week: "" as string, // "" = all days, "0".."6" = Sun..Sat
  });
  const [editing, setEditing] = useState<RawIngredientWithLocation | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    unit: "",
    order_interval_days: "",
    stocktake_visible: true,
    stocktake_day_of_week: "" as string,
  });

  useEffect(() => {
    if (currentLocationId) setForm((f) => ({ ...f, location_id: currentLocationId }));
  }, [currentLocationId]);

  async function handleAdd() {
    if (!form.location_id || !form.name.trim()) return;
    setLoading(true);
    const supabase = createClient();
    const interval =
      form.order_interval_days.trim() === ""
        ? null
        : Math.min(365, Math.max(1, parseInt(form.order_interval_days, 10) || 1));
    const dow =
      form.stocktake_day_of_week.trim() === ""
        ? null
        : Math.min(6, Math.max(0, parseInt(form.stocktake_day_of_week, 10) || 0));
    const { error } = await supabase.from("raw_ingredients").insert({
      location_id: form.location_id,
      name: form.name.trim(),
      unit: form.unit.trim() || "pcs",
      order_interval_days: interval,
      stocktake_visible: form.stocktake_visible,
      stocktake_day_of_week: dow,
    });
    if (error) alert(error.message);
    else {
      setAdding(false);
      setForm({
        location_id: form.location_id,
        name: "",
        unit: "",
        order_interval_days: "",
        stocktake_visible: true,
        stocktake_day_of_week: "",
      });
      onReload();
    }
    setLoading(false);
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setLoading(true);
    const supabase = createClient();
    const intervalEdit =
      editForm.order_interval_days.trim() === ""
        ? null
        : Math.min(365, Math.max(1, parseInt(editForm.order_interval_days, 10) || 1));
    const dowEdit =
      editForm.stocktake_day_of_week.trim() === ""
        ? null
        : Math.min(6, Math.max(0, parseInt(editForm.stocktake_day_of_week, 10) || 0));
    const { error } = await supabase
      .from("raw_ingredients")
      .update({
        name: editForm.name.trim(),
        unit: editForm.unit.trim() || "pcs",
        order_interval_days: intervalEdit,
        stocktake_visible: editForm.stocktake_visible,
        stocktake_day_of_week: dowEdit,
      })
      .eq("id", editing.id);
    if (error) alert(error.message);
    else {
      setEditing(null);
      onReload();
    }
    setLoading(false);
  }

  const stocktakeDowOptions: { value: string; label: string }[] = [
    { value: "", label: "Stocktake: every day" },
    { value: "0", label: "Sun only" },
    { value: "1", label: "Mon only" },
    { value: "2", label: "Tue only" },
    { value: "3", label: "Wed only" },
    { value: "4", label: "Thu only" },
    { value: "5", label: "Fri only" },
    { value: "6", label: "Sat only" },
  ];

  async function handleDelete(ing: RawIngredientWithLocation) {
    if (!confirm(`Delete "${ing.name}"?`)) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("raw_ingredients").delete().eq("id", ing.id);
    if (error) alert(error.message);
    else onReload();
    setLoading(false);
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Ingredients</h1>
      {currentLocationName ? (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          Editing data for: <strong>{currentLocationName}</strong>. To work with another location, go to <Link href="/dashboard" className="underline">Dashboard</Link> and change location.
        </div>
      ) : (
        <p className="mb-4 text-sm text-amber-700 dark:text-amber-400">Select a location on the Dashboard first.</p>
      )}
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Raw ingredients for this location. Used on the Ordering and Stocktake screens. The <strong>Unit</strong> is the unit you count/track (e.g. <code>g</code>, <code>ml</code>, <code>pcs</code>). <strong>Order planning (days)</strong>: leave empty for &quot;today only&quot;; use <code>7</code> for weekly items (e.g. spices) so suggested order quantities scale up. <strong>Show on stocktake</strong> and <strong>stocktake weekday</strong> match master columns I and J (see <code>docs/MASTER_SHEET_MAPPING.md</code>).
      </p>
      {adding ? (
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="mb-3 text-sm font-medium">New ingredient (for {currentLocationName || "current location"})</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <input
              placeholder="Unit (e.g. g, ml, pcs)"
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <input
              placeholder="Order planning days (empty=1, 7=weekly)"
              value={form.order_interval_days}
              onChange={(e) => setForm((f) => ({ ...f, order_interval_days: e.target.value }))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 sm:col-span-2"
            />
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.stocktake_visible}
                onChange={(e) => setForm((f) => ({ ...f, stocktake_visible: e.target.checked }))}
                className="rounded border-zinc-300"
              />
              Show on stocktake list
            </label>
            <select
              value={form.stocktake_day_of_week}
              onChange={(e) => setForm((f) => ({ ...f, stocktake_day_of_week: e.target.value }))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 sm:col-span-2"
            >
              {stocktakeDowOptions.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => handleAdd()}
              disabled={!form.name.trim() || loading}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Save
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setForm({
                  location_id: form.location_id,
                  name: "",
                  unit: "",
                  order_interval_days: "",
                  stocktake_visible: true,
                  stocktake_day_of_week: "",
                });
              }}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mb-4 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add ingredient
        </button>
      )}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Name</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Unit</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Order days</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Stocktake</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">ST day</th>
              <th className="px-4 py-2 text-right font-medium text-zinc-700 dark:text-zinc-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rawIngredients.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                  No ingredients yet. Add one above.
                </td>
              </tr>
            ) : (
              rawIngredients.map((ing) =>
                editing?.id === ing.id ? (
                  <tr key={ing.id} className="border-t border-zinc-200 dark:border-zinc-700">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="Name"
                          className="rounded border px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <input
                          value={editForm.unit}
                          onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))}
                          placeholder="Unit (g, ml, pcs)"
                          className="rounded border px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <input
                          value={editForm.order_interval_days}
                          onChange={(e) => setEditForm((f) => ({ ...f, order_interval_days: e.target.value }))}
                          placeholder="Order days (empty=1)"
                          className="w-36 rounded border px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                          <input
                            type="checkbox"
                            checked={editForm.stocktake_visible}
                            onChange={(e) => setEditForm((f) => ({ ...f, stocktake_visible: e.target.checked }))}
                            className="rounded border-zinc-300"
                          />
                          Stocktake
                        </label>
                        <select
                          value={editForm.stocktake_day_of_week}
                          onChange={(e) => setEditForm((f) => ({ ...f, stocktake_day_of_week: e.target.value }))}
                          className="rounded border px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        >
                          {stocktakeDowOptions.map((o) => (
                            <option key={o.value || "all"} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => handleSaveEdit()} disabled={loading} className="rounded bg-zinc-900 px-2 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900">Save</button>
                        <button onClick={() => setEditing(null)} className="rounded border px-2 py-1 text-xs dark:border-zinc-600">Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={ing.id} className="border-t border-zinc-200 dark:border-zinc-700">
                    <td className="px-4 py-2">{ing.name}</td>
                    <td className="px-4 py-2">{ing.unit}</td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                      {ing.order_interval_days != null && ing.order_interval_days >= 2
                        ? `${ing.order_interval_days}d`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                      {ing.stocktake_visible === false ? "No" : "Yes"}
                    </td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                      {ing.stocktake_day_of_week != null && ing.stocktake_day_of_week >= 0 && ing.stocktake_day_of_week <= 6
                        ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][ing.stocktake_day_of_week]
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => {
                          setEditing(ing);
                          setEditForm({
                            name: ing.name,
                            unit: ing.unit,
                            order_interval_days:
                              ing.order_interval_days != null && ing.order_interval_days >= 1
                                ? String(ing.order_interval_days)
                                : "",
                            stocktake_visible: ing.stocktake_visible !== false,
                            stocktake_day_of_week:
                              ing.stocktake_day_of_week != null &&
                              ing.stocktake_day_of_week >= 0 &&
                              ing.stocktake_day_of_week <= 6
                                ? String(ing.stocktake_day_of_week)
                                : "",
                          });
                        }}
                        className="text-zinc-600 hover:underline dark:text-zinc-400"
                      >
                        Edit
                      </button>
                      {" · "}
                      <button onClick={() => handleDelete(ing)} className="text-red-600 hover:underline dark:text-red-400">Delete</button>
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type RecipeRow = PrepItemIngredient & {
  prep_items?: { id: string; name: string } | null;
  raw_ingredients?: { id: string; name: string } | null;
};

function RecipeQuantityRow({
  row,
  loading,
  onUpdate,
  onDelete,
}: {
  row: RecipeRow;
  loading: boolean;
  onUpdate: (qty: string) => void;
  onDelete: () => void;
}) {
  const [val, setVal] = useState(String(row.quantity_per_unit));
  useEffect(() => {
    setVal(String(row.quantity_per_unit));
  }, [row.id, row.quantity_per_unit]);

  return (
    <tr className="border-t border-zinc-200 dark:border-zinc-700">
      <td className="px-4 py-2">{(row.prep_items as { name?: string })?.name ?? "—"}</td>
      <td className="px-4 py-2">{(row.raw_ingredients as { name?: string })?.name ?? "—"}</td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          step="any"
          min="0.01"
          disabled={loading}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => {
            if (val !== String(row.quantity_per_unit)) onUpdate(val);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="w-28 rounded border border-zinc-300 px-2 py-1 text-right text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <button type="button" onClick={onDelete} className="text-red-600 hover:underline dark:text-red-400">
          Delete
        </button>
      </td>
    </tr>
  );
}

function RecipesSection({
  currentLocationId,
  currentLocationName,
  rawIngredientsForLocation,
}: {
  currentLocationId: string;
  currentLocationName: string;
  rawIngredientsForLocation: RawIngredient[];
}) {
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [locationPrepItems, setLocationPrepItems] = useState<{ prep_item_id: string; prep_items: { id: string; name: string } | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ prep_item_id: "", raw_ingredient_id: "", quantity_per_unit: "1" });
  const [recipeSearch, setRecipeSearch] = useState("");
  const [prepItemSortDir, setPrepItemSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (!currentLocationId) {
      setRecipes([]);
      setLocationPrepItems([]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const rawIds = rawIngredientsForLocation.map((r) => r.id);
    Promise.all([
      supabase
        .from("location_prep_items")
        .select("prep_item_id, prep_items(id, name)")
        .eq("location_id", currentLocationId),
      rawIds.length > 0
        ? supabase
            .from("prep_item_ingredients")
            .select("id, prep_item_id, raw_ingredient_id, quantity_per_unit, prep_items(id, name), raw_ingredients(id, name)")
            .in("raw_ingredient_id", rawIds)
        : Promise.resolve({ data: [] as RecipeRow[], error: null }),
    ])
      .then(([lpiRes, recipeRes]) => {
        if (lpiRes.error) throw lpiRes.error;
        const lpi =
          (lpiRes.data as unknown as { prep_item_id: string; prep_items: { id: string; name: string } | null }[]) ??
          [];
        setLocationPrepItems(lpi);
        if (recipeRes.error) throw recipeRes.error;
        const raw = (recipeRes.data as (PrepItemIngredient & { prep_items?: { id: string; name: string } | null; raw_ingredients?: { id: string; name: string } | null })[]) ?? [];
        setRecipes(raw.map((r) => ({ ...r, prep_items: Array.isArray(r.prep_items) ? r.prep_items[0] : r.prep_items, raw_ingredients: Array.isArray(r.raw_ingredients) ? r.raw_ingredients[0] : r.raw_ingredients })));
      })
      .catch(() => setRecipes([]))
      .finally(() => setLoading(false));
  }, [currentLocationId, rawIngredientsForLocation]);

  async function handleAdd() {
    const qty = parseFloat(form.quantity_per_unit);
    if (!form.prep_item_id || !form.raw_ingredient_id || !Number.isFinite(qty) || qty <= 0) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("prep_item_ingredients").insert({
      prep_item_id: form.prep_item_id,
      raw_ingredient_id: form.raw_ingredient_id,
      quantity_per_unit: qty,
    });
    if (error) alert(error.message);
    else {
      setForm({ prep_item_id: form.prep_item_id, raw_ingredient_id: "", quantity_per_unit: "1" });
      const rawIds = rawIngredientsForLocation.map((r) => r.id);
      const { data } = await supabase.from("prep_item_ingredients").select("id, prep_item_id, raw_ingredient_id, quantity_per_unit, prep_items(id, name), raw_ingredients(id, name)").in("raw_ingredient_id", rawIds);
      const raw = (data as unknown as RecipeRow[]) ?? [];
      setRecipes(raw.map((r) => ({ ...r, prep_items: Array.isArray(r.prep_items) ? r.prep_items[0] : r.prep_items, raw_ingredients: Array.isArray(r.raw_ingredients) ? r.raw_ingredients[0] : r.raw_ingredients })));
    }
    setLoading(false);
  }

  async function handleDelete(row: RecipeRow) {
    if (!confirm(`Delete: ${(row.prep_items as { name?: string })?.name ?? ""} → ${(row.raw_ingredients as { name?: string })?.name ?? ""}?`)) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("prep_item_ingredients").delete().eq("id", row.id);
    if (error) alert(error.message);
    else {
      setRecipes((prev) => prev.filter((r) => r.id !== row.id));
    }
    setLoading(false);
  }

  async function handleUpdateQuantity(row: RecipeRow, quantityStr: string) {
    const qty = parseFloat(quantityStr);
    if (!Number.isFinite(qty) || qty <= 0) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("prep_item_ingredients").update({ quantity_per_unit: qty }).eq("id", row.id);
    if (error) alert(error.message);
    else {
      setRecipes((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, quantity_per_unit: qty } : r))
      );
    }
    setLoading(false);
  }

  const prepItemsForLocation = locationPrepItems
    .map((l) => l.prep_items)
    .filter(Boolean) as { id: string; name: string }[];

  const displayedRecipes = useMemo(() => {
    const q = recipeSearch.trim().toLowerCase();
    let list = recipes;
    if (q) {
      list = list.filter((row) => {
        const pn = ((row.prep_items as { name?: string })?.name ?? "").toLowerCase();
        const rn = ((row.raw_ingredients as { name?: string })?.name ?? "").toLowerCase();
        const qn = String(row.quantity_per_unit ?? "");
        return pn.includes(q) || rn.includes(q) || qn.includes(q);
      });
    }
    const mul = prepItemSortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const an = (a.prep_items as { name?: string })?.name ?? "";
      const bn = (b.prep_items as { name?: string })?.name ?? "";
      const c = an.localeCompare(bn, "en", { sensitivity: "base" });
      if (c !== 0) return c * mul;
      const ar = (a.raw_ingredients as { name?: string })?.name ?? "";
      const br = (b.raw_ingredients as { name?: string })?.name ?? "";
      return ar.localeCompare(br, "en", { sensitivity: "base" }) * mul;
    });
  }, [recipes, recipeSearch, prepItemSortDir]);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Recipes</h1>
      {currentLocationName ? (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          Recipes for <strong>{currentLocationName}</strong>. Link prep items (finished products) to raw ingredients with quantity per unit. This drives order suggestions on the Ordering page.
        </div>
      ) : (
        <p className="mb-4 text-sm text-amber-700 dark:text-amber-400">Select a location on the Dashboard first.</p>
      )}
      {loading && recipes.length === 0 ? (
        <p className="text-zinc-500">Loading…</p>
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="block max-w-md flex-1 text-sm">
              <span className="mb-1 block text-xs font-medium text-zinc-500">Search</span>
              <input
                type="search"
                value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)}
                placeholder="Prep item, raw ingredient, or quantity…"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                autoComplete="off"
              />
            </label>
            <p className="text-xs text-zinc-500">
              {displayedRecipes.length === recipes.length
                ? `${recipes.length} row${recipes.length === 1 ? "" : "s"}`
                : `${displayedRecipes.length} of ${recipes.length} rows`}
            </p>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                <th className="px-4 py-2 text-left font-medium">
                  <button
                    type="button"
                    onClick={() => setPrepItemSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                    className="inline-flex items-center gap-1 rounded font-medium text-zinc-900 hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300"
                  >
                    Prep item
                    <span className="text-zinc-400" aria-hidden>
                      {prepItemSortDir === "asc" ? "↑" : "↓"}
                    </span>
                  </button>
                </th>
                <th className="px-4 py-2 text-left font-medium">Raw ingredient</th>
                <th className="px-4 py-2 text-right font-medium">Quantity per unit</th>
                <th className="px-4 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {displayedRecipes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                    {recipes.length === 0 ? "No recipe rows yet." : "No rows match your search."}
                  </td>
                </tr>
              ) : (
                displayedRecipes.map((row) => (
                  <RecipeQuantityRow
                    key={row.id}
                    row={row}
                    loading={loading}
                    onUpdate={(qty) => handleUpdateQuantity(row, qty)}
                    onDelete={() => handleDelete(row)}
                  />
                ))
              )}
            </tbody>
          </table>
          {currentLocationId && prepItemsForLocation.length > 0 && rawIngredientsForLocation.length > 0 && (
            <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
              <h2 className="mb-3 text-sm font-medium">Add row</h2>
              <p className="mb-2 text-xs text-zinc-500">Per 1 unit of the prep item you need X units of the raw ingredient (e.g. 1 container marinated chicken = 1 container raw chicken + 0.6 container marinade).</p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500">Prep item</label>
                  <select
                    value={form.prep_item_id}
                    onChange={(e) => setForm((f) => ({ ...f, prep_item_id: e.target.value }))}
                    className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">Choose…</option>
                    {prepItemsForLocation.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500">Raw ingredient</label>
                  <select
                    value={form.raw_ingredient_id}
                    onChange={(e) => setForm((f) => ({ ...f, raw_ingredient_id: e.target.value }))}
                    className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">Choose…</option>
                    {rawIngredientsForLocation.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500">Quantity per unit</label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    value={form.quantity_per_unit}
                    onChange={(e) => setForm((f) => ({ ...f, quantity_per_unit: e.target.value }))}
                    className="w-24 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <button onClick={() => handleAdd()} disabled={loading || !form.prep_item_id || !form.raw_ingredient_id} className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
                  Add
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SuppliersSection({
  suppliers,
  locations,
  currentLocationId,
  currentLocationName,
  onReload,
  loading,
  setLoading,
}: {
  suppliers: (Supplier & { location_name?: string })[];
  locations: Location[];
  currentLocationId: string;
  currentLocationName: string;
  onReload: () => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
}) {
  const [editing, setEditing] = useState<(Supplier & { location_name?: string }) | null>(null);
  const [adding, setAdding] = useState(false);
  const [deliveryDays, setDeliveryDays] = useState<number[]>([]);
  const [form, setForm] = useState({
    name: "",
    contact_email: "",
    minimum_order_value: "",
    location_id: "",
  });

  useEffect(() => {
    if (currentLocationId) setForm((f) => ({ ...f, location_id: currentLocationId }));
  }, [currentLocationId]);

  async function loadDeliveryDays(supplierId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("supplier_delivery_schedules")
      .select("day_of_week")
      .eq("supplier_id", supplierId);
    setDeliveryDays(((data as { day_of_week: number }[]) ?? []).map((r) => r.day_of_week));
  }

  async function handleSave(isAdd: boolean) {
    setLoading(true);
    const supabase = createClient();
    try {
      const payload = {
        name: form.name,
        location_id: form.location_id || currentLocationId,
        contact_email: form.contact_email || null,
        minimum_order_value: form.minimum_order_value ? Number(form.minimum_order_value) : null,
      };
      if (isAdd) {
        const { data: inserted, error } = await supabase.from("suppliers").insert(payload).select("id").single();
        if (error) throw error;
        const sid = (inserted as { id: string }).id;
        if (deliveryDays.length) {
          await supabase.from("supplier_delivery_schedules").insert(
            deliveryDays.map((d) => ({
              supplier_id: sid,
              location_id: payload.location_id,
              day_of_week: d,
            }))
          );
        }
        setAdding(false);
        setForm({ name: "", contact_email: "", minimum_order_value: "", location_id: currentLocationId });
        setDeliveryDays([]);
      } else {
        if (!editing) return;
        const { error } = await supabase.from("suppliers").update(payload).eq("id", editing.id);
        if (error) throw error;
        await supabase.from("supplier_delivery_schedules").delete().eq("supplier_id", editing.id);
        if (deliveryDays.length) {
          await supabase.from("supplier_delivery_schedules").insert(
            deliveryDays.map((d) => ({
              supplier_id: editing.id,
              location_id: payload.location_id,
              day_of_week: d,
            }))
          );
        }
        setEditing(null);
      }
      onReload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  function toggleDay(d: number) {
    setDeliveryDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Suppliers</h1>
      {currentLocationName ? (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          Editing data for: <strong>{currentLocationName}</strong>. To work with another location, go to <Link href="/dashboard" className="underline">Dashboard</Link> and change location.
        </div>
      ) : (
        <p className="mb-4 text-sm text-amber-700 dark:text-amber-400">Select a location on the Dashboard first.</p>
      )}
      {adding ? (
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="mb-3 text-sm font-medium">New supplier</h2>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <input
                type="email"
                placeholder="Contact email"
                value={form.contact_email}
                onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <input
                type="number"
                step="any"
                placeholder="Minimum order value"
                value={form.minimum_order_value}
                onChange={(e) => setForm((f) => ({ ...f, minimum_order_value: e.target.value }))}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">Location</label>
              <select
                value={form.location_id}
                onChange={(e) => setForm((f) => ({ ...f, location_id: e.target.value }))}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">Delivery days (1=Mon … 7=Sun)</label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={deliveryDays.includes(value)}
                      onChange={() => toggleDay(value)}
                      className="rounded border-zinc-300"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => handleSave(true)}
              disabled={!form.name.trim() || loading}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Save
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setForm({ name: "", contact_email: "", minimum_order_value: "", location_id: locations[0]?.id ?? "" });
                setDeliveryDays([]);
              }}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mb-4 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add supplier
        </button>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Name</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Location</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Contact email</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Min order</th>
              <th className="px-4 py-2 text-right font-medium text-zinc-700 dark:text-zinc-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  No suppliers yet.
                </td>
              </tr>
            ) : (
              suppliers.map((sup) => (
                <SupplierRow
                  key={sup.id}
                  supplier={sup}
                  locations={locations}
                  onEdit={async () => {
                    setEditing(sup);
                    setForm({
                      name: sup.name,
                      contact_email: sup.contact_email ?? "",
                      minimum_order_value: sup.minimum_order_value != null ? String(sup.minimum_order_value) : "",
                      location_id: sup.location_id,
                    });
                    await loadDeliveryDays(sup.id);
                  }}
                  onCloseEdit={() => setEditing(null)}
                  onSave={handleSave}
                  loading={loading}
                  deliveryDays={editing?.id === sup.id ? deliveryDays : undefined}
                  setDeliveryDays={editing?.id === sup.id ? setDeliveryDays : undefined}
                  isEditing={editing?.id === sup.id}
                  editForm={editing?.id === sup.id ? form : undefined}
                  setEditForm={editing?.id === sup.id ? setForm : undefined}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SupplierRow({
  supplier,
  locations,
  onEdit,
  onCloseEdit,
  onSave,
  loading,
  deliveryDays,
  setDeliveryDays,
  isEditing,
  editForm,
  setEditForm,
}: {
  supplier: Supplier & { location_name?: string };
  locations: Location[];
  onEdit: () => void;
  onCloseEdit: () => void;
  onSave: (isAdd: false) => void;
  loading: boolean;
  deliveryDays?: number[];
  setDeliveryDays?: (v: number[] | ((p: number[]) => number[])) => void;
  isEditing: boolean;
  editForm?: { name: string; contact_email: string; minimum_order_value: string; location_id: string };
  setEditForm?: (v: React.SetStateAction<{ name: string; contact_email: string; minimum_order_value: string; location_id: string }>) => void;
}) {
  const form = editForm ?? { name: supplier.name, contact_email: supplier.contact_email ?? "", minimum_order_value: supplier.minimum_order_value != null ? String(supplier.minimum_order_value) : "", location_id: supplier.location_id };
  const setForm = setEditForm ?? (() => {});

  function toggleDay(d: number) {
    if (!setDeliveryDays || deliveryDays === undefined) return;
    setDeliveryDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  }

  if (isEditing) {
    return (
      <tr className="border-t border-zinc-200 dark:border-zinc-700">
        <td colSpan={5} className="px-4 py-3">
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="rounded border px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <input
                type="email"
                placeholder="Contact email"
                value={form.contact_email}
                onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                className="rounded border px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <input
                type="number"
                placeholder="Min order"
                value={form.minimum_order_value}
                onChange={(e) => setForm((f) => ({ ...f, minimum_order_value: e.target.value }))}
                className="rounded border px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Location</label>
              <select
                value={form.location_id}
                onChange={(e) => setForm((f) => ({ ...f, location_id: e.target.value }))}
                className="ml-2 rounded border px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <span className="text-xs text-zinc-500">Delivery days: </span>
              {DAYS.map(({ value, label }) => (
                <label key={value} className="ml-2 inline-flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={deliveryDays?.includes(value)}
                    onChange={() => toggleDay(value)}
                    className="rounded border-zinc-300"
                  />
                  {label.replace(/ \(\d\)$/, "")}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onSave(false)}
                disabled={loading}
                className="rounded bg-zinc-900 px-2 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Save
              </button>
              <button onClick={onCloseEdit} className="rounded border px-2 py-1 text-xs dark:border-zinc-600">
                Cancel
              </button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-zinc-200 dark:border-zinc-700">
      <td className="px-4 py-2">{supplier.name}</td>
      <td className="px-4 py-2">{supplier.location_name ?? "—"}</td>
      <td className="px-4 py-2">{supplier.contact_email ?? "—"}</td>
      <td className="px-4 py-2">{supplier.minimum_order_value ?? "—"}</td>
      <td className="px-4 py-2 text-right">
        <button onClick={onEdit} className="text-zinc-600 hover:underline dark:text-zinc-400">
          Edit
        </button>
      </td>
    </tr>
  );
}

function ProductsSection({
  prepItems,
  onReload,
  loading,
  setLoading,
}: {
  prepItems: PrepItem[];
  onReload: () => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
}) {
  const [editing, setEditing] = useState<PrepItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    unit: "",
    content_amount: "",
    content_unit: "",
    recipe_output_amount: "",
    recipe_output_unit: "",
    ingredient_qty_is_per_recipe_batch: false,
    batch_size: "",
    prep_time_hours: "",
    requires_overnight: false,
    overnight_alert: "",
    special_alert: "",
  });

  async function handleSave(isAdd: boolean) {
    setLoading(true);
    const supabase = createClient();
    try {
      const payload = {
        name: form.name,
        unit: form.unit || null,
        content_amount: form.content_amount ? Number(form.content_amount) : null,
        content_unit: form.content_unit.trim() || null,
        recipe_output_amount: form.recipe_output_amount ? Number(form.recipe_output_amount) : null,
        recipe_output_unit: form.recipe_output_unit.trim() || null,
        ingredient_qty_is_per_recipe_batch: form.ingredient_qty_is_per_recipe_batch,
        batch_size: form.batch_size ? Number(form.batch_size) : null,
        prep_time_hours: form.prep_time_hours ? Number(form.prep_time_hours) : null,
        requires_overnight: form.requires_overnight,
        overnight_alert: form.overnight_alert || null,
        special_alert: form.special_alert || null,
      };
      if (isAdd) {
        const { error } = await supabase.from("prep_items").insert(payload);
        if (error) throw error;
        setAdding(false);
        setForm({
          name: "",
          unit: "",
          content_amount: "",
          content_unit: "",
          recipe_output_amount: "",
          recipe_output_unit: "",
          ingredient_qty_is_per_recipe_batch: false,
          batch_size: "",
          prep_time_hours: "",
          requires_overnight: false,
          overnight_alert: "",
          special_alert: "",
        });
      } else {
        if (!editing) return;
        const { error } = await supabase.from("prep_items").update(payload).eq("id", editing.id);
        if (error) throw error;
        setEditing(null);
      }
      onReload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Products</h1>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        To show these in Stocktake, link them to a location: go to <strong>Locations</strong> → click <strong>Manage products</strong> next to the location.
      </p>
      {adding ? (
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="mb-3 text-sm font-medium">New product (prep item)</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <input
              placeholder="Unit (bottle, 1/2 GN, …)"
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <input
              type="number"
              step="any"
              placeholder="Content per unit (e.g. 750)"
              value={form.content_amount}
              onChange={(e) => setForm((f) => ({ ...f, content_amount: e.target.value }))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <input
              placeholder="Content unit (g, ml, …)"
              value={form.content_unit}
              onChange={(e) => setForm((f) => ({ ...f, content_unit: e.target.value }))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <input
              type="number"
              step="any"
              placeholder="Recipe output amount (optional)"
              value={form.recipe_output_amount}
              onChange={(e) => setForm((f) => ({ ...f, recipe_output_amount: e.target.value }))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <input
              placeholder="Recipe output unit (kg, bottles, …)"
              value={form.recipe_output_unit}
              onChange={(e) => setForm((f) => ({ ...f, recipe_output_unit: e.target.value }))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.ingredient_qty_is_per_recipe_batch}
                onChange={(e) =>
                  setForm((f) => ({ ...f, ingredient_qty_is_per_recipe_batch: e.target.checked }))
                }
                className="rounded border-zinc-300"
              />
              Ingredient qty is per full recipe batch (ordering scale)
            </label>
            <input
              type="number"
              step="any"
              placeholder="Batch size"
              value={form.batch_size}
              onChange={(e) => setForm((f) => ({ ...f, batch_size: e.target.value }))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <input
              type="number"
              step="any"
              placeholder="Prep time (hours)"
              value={form.prep_time_hours}
              onChange={(e) => setForm((f) => ({ ...f, prep_time_hours: e.target.value }))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.requires_overnight}
                onChange={(e) => setForm((f) => ({ ...f, requires_overnight: e.target.checked }))}
                className="rounded border-zinc-300"
              />
              Requires overnight
            </label>
            <input
              placeholder="Overnight alert"
              value={form.overnight_alert}
              onChange={(e) => setForm((f) => ({ ...f, overnight_alert: e.target.value }))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 sm:col-span-2"
            />
            <input
              placeholder="Special alert"
              value={form.special_alert}
              onChange={(e) => setForm((f) => ({ ...f, special_alert: e.target.value }))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 sm:col-span-2"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => handleSave(true)}
              disabled={!form.name.trim() || loading}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Save
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setForm({
                  name: "",
                  unit: "",
                  content_amount: "",
                  content_unit: "",
                  recipe_output_amount: "",
                  recipe_output_unit: "",
                  ingredient_qty_is_per_recipe_batch: false,
                  batch_size: "",
                  prep_time_hours: "",
                  requires_overnight: false,
                  overnight_alert: "",
                  special_alert: "",
                });
              }}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mb-4 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add product
        </button>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Name</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Unit</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Content / unit</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Recipe output</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Batch size</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Prep time (h)</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Overnight</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300">Alerts</th>
              <th className="px-4 py-2 text-right font-medium text-zinc-700 dark:text-zinc-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {prepItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-zinc-500">
                  No products yet.
                </td>
              </tr>
            ) : (
              prepItems.map((item) =>
                editing?.id === item.id ? (
                  <tr key={item.id} className="border-t border-zinc-200 dark:border-zinc-700">
                    <td colSpan={9} className="px-4 py-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          placeholder="Name"
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          className="rounded border px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <input
                          placeholder="Unit"
                          value={form.unit}
                          onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                          className="rounded border px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <input
                          type="number"
                          placeholder="Content amount"
                          value={form.content_amount}
                          onChange={(e) => setForm((f) => ({ ...f, content_amount: e.target.value }))}
                          className="rounded border px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <input
                          placeholder="Content unit (g, ml)"
                          value={form.content_unit}
                          onChange={(e) => setForm((f) => ({ ...f, content_unit: e.target.value }))}
                          className="rounded border px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <input
                          type="number"
                          placeholder="Batch size"
                          value={form.batch_size}
                          onChange={(e) => setForm((f) => ({ ...f, batch_size: e.target.value }))}
                          className="rounded border px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <input
                          type="number"
                          placeholder="Prep time (h)"
                          value={form.prep_time_hours}
                          onChange={(e) => setForm((f) => ({ ...f, prep_time_hours: e.target.value }))}
                          className="rounded border px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <label className="flex items-center gap-2 text-sm sm:col-span-2">
                          <input
                            type="checkbox"
                            checked={form.requires_overnight}
                            onChange={(e) => setForm((f) => ({ ...f, requires_overnight: e.target.checked }))}
                            className="rounded border-zinc-300"
                          />
                          Requires overnight
                        </label>
                        <input
                          placeholder="Overnight alert"
                          value={form.overnight_alert}
                          onChange={(e) => setForm((f) => ({ ...f, overnight_alert: e.target.value }))}
                          className="rounded border px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <input
                          placeholder="Special alert"
                          value={form.special_alert}
                          onChange={(e) => setForm((f) => ({ ...f, special_alert: e.target.value }))}
                          className="rounded border px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => handleSave(false)}
                          disabled={loading}
                          className="rounded bg-zinc-900 px-2 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="rounded border px-2 py-1 text-xs dark:border-zinc-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={item.id} className="border-t border-zinc-200 dark:border-zinc-700">
                    <td className="px-4 py-2">{item.name}</td>
                    <td className="px-4 py-2">{item.unit ?? "—"}</td>
                    <td className="px-4 py-2">
                      {item.content_amount != null && item.content_unit
                        ? `${item.content_amount} ${item.content_unit}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 max-w-[140px] text-xs">
                      {item.recipe_output_amount != null && item.recipe_output_unit
                        ? `${item.recipe_output_amount} ${item.recipe_output_unit}${
                            item.ingredient_qty_is_per_recipe_batch ? " · batch" : ""
                          }`
                        : "—"}
                    </td>
                    <td className="px-4 py-2">{item.batch_size ?? "—"}</td>
                    <td className="px-4 py-2">{item.prep_time_hours ?? "—"}</td>
                    <td className="px-4 py-2">{item.requires_overnight ? "Yes" : "—"}</td>
                    <td className="px-4 py-2 max-w-[120px] truncate" title={[item.overnight_alert, item.special_alert].filter(Boolean).join(" / ")}>
                      {[item.overnight_alert, item.special_alert].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => {
                          setEditing(item);
                          setForm({
                            name: item.name,
                            unit: item.unit ?? "",
                            content_amount:
                              item.content_amount != null ? String(item.content_amount) : "",
                            content_unit: item.content_unit ?? "",
                            recipe_output_amount:
                              item.recipe_output_amount != null ? String(item.recipe_output_amount) : "",
                            recipe_output_unit: item.recipe_output_unit ?? "",
                            ingredient_qty_is_per_recipe_batch:
                              item.ingredient_qty_is_per_recipe_batch === true,
                            batch_size: item.batch_size != null ? String(item.batch_size) : "",
                            prep_time_hours: item.prep_time_hours != null ? String(item.prep_time_hours) : "",
                            requires_overnight: item.requires_overnight ?? false,
                            overnight_alert: item.overnight_alert ?? "",
                            special_alert: item.special_alert ?? "",
                          });
                        }}
                        className="text-zinc-600 hover:underline dark:text-zinc-400"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { useCan, PERMISSIONS } from "@/hooks/useCan";

type LocationOption = { id: string; name: string };
type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  active: boolean;
  roles: string[];
  location_ids: string[];
  created_at: string | null;
  last_sign_in_at: string | null;
};

type ApiResponse = {
  users: UserRow[];
  locations: LocationOption[];
};

type NewUserForm = {
  email: string;
  displayName: string;
  roleKey: "admin" | "manager" | "employee";
  locationIds: string[];
  flow: "invite" | "link_existing";
};

const ROLE_OPTIONS: Array<{ key: "admin" | "manager" | "employee"; label: string }> = [
  { key: "admin", label: "Admin" },
  { key: "manager", label: "Manager" },
  { key: "employee", label: "Employee" },
];

export default function AdminUsersPage() {
  const { allowed, loading: canLoading } = useCan(PERMISSIONS.usersManage);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { roleKey: "admin" | "manager" | "employee"; locationIds: string[]; displayName: string; active: boolean }>>({});
  const [newUser, setNewUser] = useState<NewUserForm>({
    email: "",
    displayName: "",
    roleKey: "employee",
    locationIds: [],
    flow: "invite",
  });

  async function loadData() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/users");
    const json = (await res.json()) as ApiResponse | { error?: string };
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "Failed to load users");
      setLoading(false);
      return;
    }
    const payload = json as ApiResponse;
    setUsers(payload.users ?? []);
    setLocations(payload.locations ?? []);
    const nextDrafts: Record<string, { roleKey: "admin" | "manager" | "employee"; locationIds: string[]; displayName: string; active: boolean }> = {};
    for (const u of payload.users ?? []) {
      const role = (u.roles[0] as "admin" | "manager" | "employee" | undefined) ?? "employee";
      nextDrafts[u.id] = {
        roleKey: role,
        locationIds: u.location_ids ?? [],
        displayName: u.display_name ?? "",
        active: u.active ?? true,
      };
    }
    setDrafts(nextDrafts);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!canLoading && allowed) void loadData();
    if (!canLoading && !allowed) setLoading(false);
  }, [canLoading, allowed]);

  const sortedLocations = useMemo(
    () => [...locations].sort((a, b) => a.name.localeCompare(b.name)),
    [locations]
  );

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Failed to create user");
      setSaving(false);
      return;
    }
    setMessage(newUser.flow === "invite" ? "Invite sent and permissions assigned." : "Existing user linked and permissions assigned.");
    setNewUser({
      email: "",
      displayName: "",
      roleKey: "employee",
      locationIds: [],
      flow: "invite",
    });
    setSaving(false);
    await loadData();
  }

  async function saveUser(userId: string) {
    const draft = drafts[userId];
    if (!draft) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Failed to save user");
      setSaving(false);
      return;
    }
    setMessage("User updated.");
    setSaving(false);
    await loadData();
  }

  if (canLoading || loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
        <TopNav />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <p className="text-sm text-zinc-500">Loading users…</p>
        </main>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
        <TopNav />
        <main className="mx-auto max-w-4xl px-4 py-8">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            Je hebt geen rechten om gebruikersbeheer te openen.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Users & roles</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Beheer gebruikers, rol en locatie-toegang.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← Admin
          </Link>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
            {message}
          </div>
        )}

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Nieuwe gebruiker</h2>
          <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={createUser}>
            <label className="text-sm text-zinc-700 dark:text-zinc-300">
              E-mail
              <input
                value={newUser.email}
                onChange={(e) => setNewUser((s) => ({ ...s, email: e.target.value }))}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-600 dark:bg-zinc-900"
                type="email"
                required
              />
            </label>
            <label className="text-sm text-zinc-700 dark:text-zinc-300">
              Weergavenaam
              <input
                value={newUser.displayName}
                onChange={(e) => setNewUser((s) => ({ ...s, displayName: e.target.value }))}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-600 dark:bg-zinc-900"
              />
            </label>
            <label className="text-sm text-zinc-700 dark:text-zinc-300">
              Rol
              <select
                value={newUser.roleKey}
                onChange={(e) => setNewUser((s) => ({ ...s, roleKey: e.target.value as NewUserForm["roleKey"] }))}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-600 dark:bg-zinc-900"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-zinc-700 dark:text-zinc-300">
              Aanmaakmethode
              <select
                value={newUser.flow}
                onChange={(e) => setNewUser((s) => ({ ...s, flow: e.target.value as NewUserForm["flow"] }))}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-600 dark:bg-zinc-900"
              >
                <option value="invite">Invite vanuit app</option>
                <option value="link_existing">Koppel bestaand Supabase-account</option>
              </select>
            </label>
            <label className="text-sm text-zinc-700 dark:text-zinc-300 md:col-span-2">
              Locaties (voor manager/employee)
              <select
                multiple
                value={newUser.locationIds}
                onChange={(e) =>
                  setNewUser((s) => ({
                    ...s,
                    locationIds: Array.from(e.target.selectedOptions).map((o) => o.value),
                  }))
                }
                className="mt-1 min-h-28 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
              >
                {sortedLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="h-11 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {saving ? "Opslaan…" : "Gebruiker toevoegen"}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Bestaande gebruikers</h2>
          <div className="mt-4 space-y-3">
            {users.map((u) => {
              const draft = drafts[u.id];
              if (!draft) return null;
              return (
                <div key={u.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
                  <div className="mb-2 text-sm text-zinc-500">{u.email ?? "(geen e-mail)"}</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm text-zinc-700 dark:text-zinc-300">
                      Weergavenaam
                      <input
                        value={draft.displayName}
                        onChange={(e) =>
                          setDrafts((s) => ({
                            ...s,
                            [u.id]: { ...s[u.id], displayName: e.target.value },
                          }))
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-2.5 dark:border-zinc-600 dark:bg-zinc-900"
                      />
                    </label>
                    <label className="text-sm text-zinc-700 dark:text-zinc-300">
                      Rol
                      <select
                        value={draft.roleKey}
                        onChange={(e) =>
                          setDrafts((s) => ({
                            ...s,
                            [u.id]: {
                              ...s[u.id],
                              roleKey: e.target.value as "admin" | "manager" | "employee",
                            },
                          }))
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-2.5 dark:border-zinc-600 dark:bg-zinc-900"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-zinc-700 dark:text-zinc-300 md:col-span-2">
                      Locaties
                      <select
                        multiple
                        value={draft.locationIds}
                        onChange={(e) =>
                          setDrafts((s) => ({
                            ...s,
                            [u.id]: {
                              ...s[u.id],
                              locationIds: Array.from(e.target.selectedOptions).map((o) => o.value),
                            },
                          }))
                        }
                        className="mt-1 min-h-24 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-2 dark:border-zinc-600 dark:bg-zinc-900"
                      >
                        {sortedLocations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(e) =>
                          setDrafts((s) => ({
                            ...s,
                            [u.id]: { ...s[u.id], active: e.target.checked },
                          }))
                        }
                      />
                      Actief
                    </label>
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveUser(u.id)}
                      className="h-10 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      Opslaan
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}


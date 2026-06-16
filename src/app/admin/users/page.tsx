"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { isAuthDisabled } from "@/lib/authMode";
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
  const authOff = isAuthDisabled();
  const { allowed, loading: canLoading } = useCan(PERMISSIONS.usersManage);

  if (authOff) {
    return (
      <div className="min-h-screen bg-background font-sans">
        <TopNav />
        <main className="mx-auto max-w-lg px-4 py-12 text-center">
          <h1 className="section-title text-xl">Users disabled</h1>
          <p className="mt-3 help-text">
            Login and user management are turned off. Set{" "}
            <code className="text-xs">NEXT_PUBLIC_AUTH_DISABLED=false</code> to re-enable.
          </p>
          <Link href="/admin" className="mt-6 inline-block label">
            ← Admin
          </Link>
        </main>
      </div>
    );
  }
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
      <div className="min-h-screen bg-background font-sans">
        <TopNav />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <p className="help-text">Loading users…</p>
        </main>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-background font-sans">
        <TopNav />
        <main className="mx-auto max-w-4xl px-4 py-8">
          <div className="alert-warning rounded-xl p-4 text-sm">
            You do not have permission to open user management.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans">
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Users & roles</h1>
            <p className="mt-1 help-text">
              Manage users, roles, and location access.
            </p>
          </div>
          <Link
            href="/admin"
            className="help-text hover:text-ink"
          >
            ← Admin
          </Link>
        </div>

        {error && (
          <div className="alert-error rounded-xl">
            {error}
          </div>
        )}
        {message && (
          <div className="badge-success rounded-xl border p-3 text-sm">
            {message}
          </div>
        )}

        <section className="rounded-2xl border border-brand-sage/50 bg-surface p-4">
          <h2 className="text-lg font-medium text-ink">New user</h2>
          <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={createUser}>
            <label className="text-sm text-ink-soft">
              Email
              <input
                value={newUser.email}
                onChange={(e) => setNewUser((s) => ({ ...s, email: e.target.value }))}
                className="mt-1 h-11 w-full rounded-xl border border-brand-green/15 bg-surface px-3"
                type="email"
                required
              />
            </label>
            <label className="text-sm text-ink-soft">
              Display name
              <input
                value={newUser.displayName}
                onChange={(e) => setNewUser((s) => ({ ...s, displayName: e.target.value }))}
                className="mt-1 h-11 w-full rounded-xl border border-brand-green/15 bg-surface px-3"
              />
            </label>
            <label className="text-sm text-ink-soft">
              Role
              <select
                value={newUser.roleKey}
                onChange={(e) => setNewUser((s) => ({ ...s, roleKey: e.target.value as NewUserForm["roleKey"] }))}
                className="mt-1 h-11 w-full rounded-xl border border-brand-green/15 bg-surface px-3"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ink-soft">
              Creation method
              <select
                value={newUser.flow}
                onChange={(e) => setNewUser((s) => ({ ...s, flow: e.target.value as NewUserForm["flow"] }))}
                className="mt-1 h-11 w-full rounded-xl border border-brand-green/15 bg-surface px-3"
              >
                <option value="invite">Invite from app</option>
                <option value="link_existing">Link existing Supabase account</option>
              </select>
            </label>
            <label className="text-sm text-ink-soft md:col-span-2">
              Locations (for manager/employee)
              <select
                multiple
                value={newUser.locationIds}
                onChange={(e) =>
                  setNewUser((s) => ({
                    ...s,
                    locationIds: Array.from(e.target.selectedOptions).map((o) => o.value),
                  }))
                }
                className="mt-1 min-h-28 w-full rounded-xl border border-brand-green/15 bg-surface px-3 py-2"
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
                className="btn-primary h-11 rounded-xl px-4 text-sm font-medium disabled:opacity-50"
              >
                {saving ? "Saving…" : "Add user"}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-brand-sage/50 bg-surface p-4">
          <h2 className="text-lg font-medium text-ink">Existing users</h2>
          <div className="mt-4 space-y-3">
            {users.map((u) => {
              const draft = drafts[u.id];
              if (!draft) return null;
              return (
                <div key={u.id} className="rounded-xl border border-brand-green/10 p-3">
                  <div className="mb-2 help-text">{u.email ?? "(no email)"}</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm text-ink-soft">
                      Display name
                      <input
                        value={draft.displayName}
                        onChange={(e) =>
                          setDrafts((s) => ({
                            ...s,
                            [u.id]: { ...s[u.id], displayName: e.target.value },
                          }))
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-brand-green/15 bg-surface px-2.5"
                      />
                    </label>
                    <label className="text-sm text-ink-soft">
                      Role
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
                        className="mt-1 h-10 w-full rounded-lg border border-brand-green/15 bg-surface px-2.5"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-ink-soft md:col-span-2">
                      Locations
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
                        className="mt-1 min-h-24 w-full rounded-lg border border-brand-green/15 bg-surface px-2.5 py-2"
                      >
                        {sortedLocations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
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
                      Active
                    </label>
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveUser(u.id)}
                      className="btn-primary h-10 rounded-lg px-3 text-sm font-medium disabled:opacity-50"
                    >
                      Save
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


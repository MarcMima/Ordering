"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

/**
 * Client-side backstop if Edge middleware does not run or errors.
 * Blocks rendering protected routes until a session exists.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [allowed, setAllowed] = useState(pathname === "/login");

  useEffect(() => {
    if (pathname === "/login") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAllowed(true);
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    void supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (cancelled) return;
      if (error || !user) {
        const next = pathname + (typeof window !== "undefined" ? window.location.search : "");
        router.replace(`/login?next=${encodeURIComponent(next || "/dashboard")}`);
        return;
      }
      const needsUsersManage = pathname.startsWith("/admin/users");
      const needsSettingsManage = pathname.startsWith("/admin");
      const needsHaccpManage = pathname.startsWith("/dashboard/haccp/leveranciers");

      if (!needsUsersManage && !needsSettingsManage && !needsHaccpManage) {
        setAllowed(true);
        return;
      }

      void supabase
        .rpc("current_user_authz")
        .single<{ permission_keys: string[] | null; is_admin: boolean | null }>()
        .then(({ data: authz }) => {
          if (cancelled) return;
          const permissions = authz?.permission_keys ?? [];
          const isAdmin = Boolean(authz?.is_admin);
          const has = (key: string) => isAdmin || permissions.includes(key);
          const ok =
            (!needsUsersManage || has("users.manage")) &&
            (!needsSettingsManage || has("settings.manage")) &&
            (!needsHaccpManage || has("haccp.manage"));
          if (!ok) {
            router.replace("/dashboard");
            return;
          }
          setAllowed(true);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        Checking session…
      </div>
    );
  }

  return <>{children}</>;
}

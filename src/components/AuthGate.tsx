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
      setAllowed(true);
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

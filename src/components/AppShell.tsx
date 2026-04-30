"use client";

import { usePathname } from "next/navigation";
import { LocationProvider } from "@/contexts/LocationContext";
import { AuthGate } from "./AuthGate";
import { BottomNav } from "./BottomNav";
import { ScrollRestoration } from "./ScrollRestoration";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideNav = pathname === "/login";

  return (
    <LocationProvider>
      <AuthGate>
        <ScrollRestoration />
        <div className={hideNav ? "min-h-screen" : "min-h-screen pb-20"}>{children}</div>
        {!hideNav && <BottomNav />}
      </AuthGate>
    </LocationProvider>
  );
}

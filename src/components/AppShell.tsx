"use client";

import { LocationProvider } from "@/contexts/LocationContext";
import { BottomNav } from "./BottomNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LocationProvider>
      <div className="min-h-screen pb-20">{children}</div>
      <BottomNav />
    </LocationProvider>
  );
}

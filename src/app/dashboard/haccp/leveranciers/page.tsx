"use client";

import Link from "next/link";
import { LeveranciersDocumentsPanel } from "@/components/haccp/LeveranciersDocumentsPanel";
import { HaccpFormGate } from "@/components/HaccpFormGate";
import { TopNav } from "@/components/TopNav";
import { useLocation } from "@/contexts/LocationContext";
import { APP_FORM_KEYS } from "@/lib/appFormKeys";
import { getHaccpStoreId } from "@/lib/haccp/types";

export default function LeveranciersPage() {
  const { locations, locationId } = useLocation();
  const storeId = getHaccpStoreId(locations, locationId);

  return (
    <HaccpFormGate formKey={APP_FORM_KEYS.haccp_suppliers}>
      <div className="min-h-screen bg-background font-sans">
        <TopNav />
        <main className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:px-6">
          <Link
            href="/dashboard/haccp"
            className="text-sm font-medium text-ink-soft/80 hover:text-ink"
          >
            ← HACCP overview
          </Link>
          <h1 className="mt-4 section-title text-xl sm:text-2xl">Suppliers</h1>
          <div className="mt-6">
            <LeveranciersDocumentsPanel storeId={storeId} locationId={locationId} />
          </div>
        </main>
      </div>
    </HaccpFormGate>
  );
}

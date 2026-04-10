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
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
        <TopNav />
        <main className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:px-6">
          <Link
            href="/dashboard/haccp"
            className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← HACCP overview
          </Link>
          <h1 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50 sm:text-2xl">Suppliers</h1>
          <div className="mt-6">
            <LeveranciersDocumentsPanel storeId={storeId} />
          </div>
        </main>
      </div>
    </HaccpFormGate>
  );
}

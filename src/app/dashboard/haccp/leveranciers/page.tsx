import Link from "next/link";
import { HaccpFormGate } from "@/components/HaccpFormGate";
import { TopNav } from "@/components/TopNav";
import { APP_FORM_KEYS } from "@/lib/appFormKeys";

export default function LeveranciersPlaceholderPage() {
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
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            The <code className="text-xs">haccp_leveranciers</code> table exists; per-supplier questionnaire forms are
            not built yet.
          </p>
        </main>
      </div>
    </HaccpFormGate>
  );
}

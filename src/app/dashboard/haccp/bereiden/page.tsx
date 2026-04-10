import Link from "next/link";
import { TopNav } from "@/components/TopNav";

export default function BereidenPlaceholderPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:px-6">
        <Link
          href="/dashboard/haccp"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          ← HACCP weekoverzicht
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50 sm:text-2xl">
          Bereiden & serveren
        </h1>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Dit formulier volgt hetzelfde patroon als de andere HACCP-schermen en wordt later toegevoegd.
        </p>
      </main>
    </div>
  );
}

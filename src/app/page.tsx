import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background font-sans">
      <main className="flex max-w-2xl flex-col items-center gap-8 px-6 py-16 text-center">
        <h1 className="page-title text-3xl tracking-tight">
          MIMA Kitchen
        </h1>
        <p className="text-lg text-ink-soft">
          Kitchen operations platform for stocktaking, prep lists, and ordering.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="btn-primary rounded-full px-6 py-3 font-medium"
          >
            Open Dashboard
          </Link>
          <Link
            href="/admin"
            className="btn-secondary rounded-full border-2 px-6 py-3 font-medium"
          >
            Admin
          </Link>
        </div>
      </main>
    </div>
  );
}

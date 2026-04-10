"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace(safeNext);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-sm px-4">
      <div className="mb-8 flex justify-center">
        <Link href="/login" className="rounded-md bg-white" style={{ backgroundColor: "#ffffff" }}>
          <Image
            src="/mima-logo.png"
            alt="Mima"
            width={800}
            height={426}
            className="h-12 w-auto max-w-[220px] object-contain"
            priority
            unoptimized
          />
        </Link>
      </div>
      <h1 className="mb-6 text-center text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Log in
      </h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="h-12 w-full rounded-xl bg-zinc-900 font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-zinc-900">
      <Suspense
        fallback={<p className="text-center text-zinc-500 dark:text-zinc-400">Loading…</p>}
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { isAuthDisabled } from "@/lib/authMode";
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

  useEffect(() => {
    if (isAuthDisabled()) {
      router.replace(safeNext);
    }
  }, [router, safeNext]);

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
        <Link href="/login" className="rounded-md bg-surface">
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
      <h1 className="mb-6 text-center section-title text-xl">
        Log in
      </h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block label">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-lg w-full"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block label">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-lg w-full"
          />
        </div>
        {error && (
          <p className="alert-error rounded-lg">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="h-12 w-full btn-primary input-lg rounded-xl font-medium disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16">
      <Suspense
        fallback={<p className="text-center text-ink-soft/80">Loading…</p>}
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}

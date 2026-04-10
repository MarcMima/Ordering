import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1) || "/";
  }
  return pathname || "/";
}

export async function updateSession(request: NextRequest) {
  const pathname = normalizePath(request.nextUrl.pathname);
  const isLogin = pathname === "/login";

  if (!supabaseUrl || !supabaseAnonKey) {
    if (!isLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname + request.nextUrl.search);
      url.searchParams.set("error", "config");
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    const { data, error } = await supabase.auth.getUser();
    const user = error ? null : data?.user ?? null;

    if (!user && !isLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      const nextPath = pathname + request.nextUrl.search;
      url.searchParams.set("next", nextPath === "/login" ? "/dashboard" : nextPath);
      return NextResponse.redirect(url);
    }

    if (user && isLogin) {
      const next = request.nextUrl.searchParams.get("next");
      const safeNext =
        next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      const url = request.nextUrl.clone();
      url.pathname = safeNext;
      url.search = "";
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch {
    if (!isLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }
}

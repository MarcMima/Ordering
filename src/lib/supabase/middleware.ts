import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

type AuthzRow = {
  permission_keys: string[] | null;
  is_admin: boolean | null;
};

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

    if (user && !isLogin) {
      const { data: authz, error: authzError } = await supabase.rpc("current_user_authz").single<AuthzRow>();
      // Avoid silent "no-op" navigation loops when authz RPC has transient issues.
      // In that case, let the request continue and let page-level checks render feedback.
      if (authzError) {
        return supabaseResponse;
      }
      const permissions = authz?.permission_keys ?? [];
      const isAdmin = Boolean(authz?.is_admin);

      const needsUsersManage = pathname.startsWith("/admin/users");
      const needsSettingsManage = pathname.startsWith("/admin");
      const needsHaccpManage = pathname.startsWith("/dashboard/haccp/leveranciers");

      const has = (key: string) => isAdmin || permissions.includes(key);
      const allowed =
        (!needsUsersManage || has("users.manage")) &&
        (!needsSettingsManage || has("settings.manage")) &&
        (!needsHaccpManage || has("haccp.manage"));

      if (!allowed) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        url.search = "";
        return NextResponse.redirect(url);
      }
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

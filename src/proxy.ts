import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";

/**
 * Session refresh and the coarse logged-in / logged-out gate.
 *
 * In Next 16 this file is `proxy.ts`, not `middleware.ts`, and the exported
 * function is `proxy`. It always runs on the Node runtime.
 *
 * This is a convenience redirect, NOT the security boundary. A user who defeats
 * it reaches pages whose every query is still filtered by RLS. Per-record
 * authorisation belongs in policies; per-page role checks belong in
 * `lib/auth.ts`. See SYSTEM_DESIGN.md section 7.
 */

/**
 * Reachable while logged out. Everything else redirects to /login.
 *
 * `/api/health` is here so the deployed commit can be checked without a
 * session — a health check that requires signing in cannot answer "is the app
 * up" when the answer is no.
 */
const PUBLIC_PATHS = ["/login", "/set-password", "/auth", "/api/health"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function proxy(request: NextRequest) {
  // Rebuilt whenever Supabase rotates the session cookies, so the refreshed
  // tokens ride back to the browser on this same response.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.supabaseUrl(),
    publicEnv.supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Do not remove or reorder. This call is what refreshes an expiring token,
  // and it validates the JWT against the auth server rather than trusting the
  // cookie. Reading the session without it would trust unverified cookie data.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    // So the user lands back where they were aiming after signing in.
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (user && (pathname === "/login" || pathname === "/")) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Keeping the proxy off
     * asset requests is what stops one auth round-trip per icon.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

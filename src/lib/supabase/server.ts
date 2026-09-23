import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database.types";

/**
 * User-scoped server client, for server components, server actions, and route
 * handlers. Runs as the logged-in user, so RLS applies. This is the client
 * almost all application code should reach for.
 *
 * `cookies()` is async in Next 16, so this function is async too.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.supabaseUrl(),
    publicEnv.supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a server component, where cookies are read-only.
            // The proxy refreshes the session on every request, so the write
            // that failed here has already happened there. Safe to ignore.
          }
        },
      },
    },
  );
}

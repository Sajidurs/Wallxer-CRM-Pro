import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database.types";

/**
 * Browser client. Carries the logged-in user's session, so every query it makes
 * is subject to RLS. Use this only in client components — server components and
 * server actions use `@/lib/supabase/server`.
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.supabaseUrl(),
    publicEnv.supabaseAnonKey(),
  );
}

import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv, serverEnv } from "@/lib/env";
import type { Database } from "@/types/database.types";

/**
 * Service-role client. **Bypasses RLS entirely.**
 *
 * Permitted uses, and nothing else:
 *   - inviting a user (`auth.admin.inviteUserByEmail`)
 *   - suspending or deleting an auth user
 *   - one-off maintenance scripts
 *
 * Every other read and write goes through `@/lib/supabase/server`, so that the
 * database stays the security boundary. See SYSTEM_DESIGN.md section 7.1.
 *
 * The `server-only` import above turns any accidental client-component import
 * into a build error rather than a leaked key.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    publicEnv.supabaseUrl(),
    serverEnv.supabaseServiceRoleKey(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

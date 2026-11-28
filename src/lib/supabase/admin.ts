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
 *   - looking up a bot API key, touching `last_used_at`, and writing `mcp_audit_log`
 *   - minting a short-lived session so MCP can then act as that key's profile
 *   - one-off maintenance scripts
 *
 * MCP reads and writes of CRM data do not stay on this client. After the key
 * is resolved they go through a user-scoped client, so RLS still applies.
 * See SYSTEM_DESIGN.md section 7.5.
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

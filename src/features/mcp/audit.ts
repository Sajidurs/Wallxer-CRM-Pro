import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { McpContext } from "./context";
import { publicError } from "./redact";

/**
 * One row per write tool call.
 *
 * The table has no insert policy for signed-in users, so this goes through
 * the service role. Arguments are not stored: a task title is not a secret,
 * but a future tool input might be, and the row is already enough to answer
 * who did what.
 */
export async function writeAudit(
  ctx: McpContext,
  tool: string,
  entityType: string | null,
  entityId: string | null,
  ok: boolean,
  error: string | null,
): Promise<void> {
  try {
    const { error: insertError } = await createAdminClient().from("mcp_audit_log").insert({
      workspace_id: ctx.profile.workspace_id,
      api_key_id: ctx.keyId,
      profile_id: ctx.profile.id,
      tool: tool.slice(0, 80),
      entity_type: entityType,
      entity_id: entityId,
      ok,
      error: error ? publicError(error) : null,
    });

    if (insertError) console.error("mcp audit insert failed", insertError.code);
  } catch {
    console.error("mcp audit insert failed");
  }
}

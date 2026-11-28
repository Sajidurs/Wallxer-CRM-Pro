"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { atLeast } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFromZod, firstIssueMessage } from "@/lib/zod";

import { generateApiKey } from "@/features/mcp/auth";

import { createBotKeySchema, revokeBotKeySchema } from "./schema";

/**
 * Issue a key. The token is returned to this request and nowhere else: the
 * insert stores the hash, and the select list cannot read that column back.
 */
export async function createBotKey(
  input: unknown,
): Promise<ActionResult<{ id: string; token: string; prefix: string }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!atLeast(actor.role, "admin")) {
    return fail("Only an admin can create an API key.");
  }

  const parsed = createBotKeySchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, status, workspace_id")
    .eq("id", parsed.data.profileId)
    .maybeSingle();

  if (profileError) return fail(profileError.message);
  if (!profile || profile.workspace_id !== actor.workspace_id || profile.status !== "active") {
    return fail("Choose an active person in this workspace.");
  }

  const issued = generateApiKey();
  const { data, error } = await supabase
    .from("bot_api_keys")
    .insert({
      workspace_id: actor.workspace_id,
      profile_id: profile.id,
      name: parsed.data.name,
      key_prefix: issued.prefix,
      secret_hash: issued.hash,
      scopes: parsed.data.scopes,
      created_by: actor.id,
    })
    .select("id")
    .single();

  if (error) return fail(error.message);

  revalidatePath("/settings/bots");
  return ok({ id: data.id, token: issued.token, prefix: issued.prefix });
}

/** One-way. A revoked key cannot be turned back on; create another. */
export async function revokeBotKey(input: unknown): Promise<ActionResult<{ id: string }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!atLeast(actor.role, "admin")) {
    return fail("Only an admin can revoke an API key.");
  }

  const parsed = revokeBotKeySchema.safeParse(input);
  if (!parsed.success) return fail("That key is not valid.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bot_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();

  if (error) return fail(error.message);
  if (!data) return fail("That key is already revoked, or it does not exist.");

  revalidatePath("/settings/bots");
  return ok({ id: data.id });
}

"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFromZod, firstIssueMessage } from "@/lib/zod";

import {
  createCredentialSchema,
  deleteCredentialSchema,
  revealCredentialSchema,
  updateCredentialSchema,
} from "./schema";

/**
 * Every function here is a thin wrapper over a security definer RPC.
 *
 * The encryption, the permission check, and the access-log write all live in
 * the database, so this layer cannot accidentally skip any of them — and a
 * second client, a mobile app or a future public API, gets the same guarantees
 * without reimplementing them.
 */

export async function createCredential(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!can(actor, "create", "credential")) {
    return fail("Only a manager or above can add a credential.");
  }

  const parsed = createCredentialSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const supabase = await createClient();

  // Postgres cannot express "this text parameter accepts null", so Supabase's
  // type generator types every text param as non-null. The function does accept
  // null — a credential with no URL is normal — so the cast is narrowing the
  // generator's guess, not bypassing a real constraint.
  const { data, error } = await supabase.rpc("create_credential", {
    p_project_id: parsed.data.projectId,
    p_label: parsed.data.label,
    p_category: parsed.data.category,
    p_url: parsed.data.url,
    p_username: parsed.data.username,
    p_secret: parsed.data.secret,
    p_notes: parsed.data.notes,
    p_contact_id: parsed.data.contactId,
  } as never);

  if (error) return fail(error.message);

  revalidatePath(`/projects/${parsed.data.projectId}`);
  return ok({ id: data as string });
}

export async function updateCredential(
  input: unknown,
): Promise<ActionResult<undefined>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!can(actor, "update", "credential")) {
    return fail("Only a manager or above can edit a credential.");
  }

  const parsed = updateCredentialSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const supabase = await createClient();

  // See the note in createCredential about this cast.
  const { error } = await supabase.rpc("update_credential", {
    p_id: parsed.data.id,
    p_label: parsed.data.label,
    p_category: parsed.data.category,
    p_url: parsed.data.url,
    p_username: parsed.data.username,
    p_secret: parsed.data.secret,
    p_notes: parsed.data.notes,
    p_clear_notes: parsed.data.clearNotes,
  } as never);

  if (error) return fail(error.message);

  revalidatePath("/projects");
  return ok();
}

/**
 * Reveals one secret.
 *
 * The RPC writes the access-log row before it returns anything, so there is no
 * code path — here or anywhere else — that yields a plaintext secret without
 * recording who asked for it.
 *
 * SYSTEM_DESIGN 7.3, frontend rules: the value is returned to a client
 * component that holds it in state and clears it after 30 seconds. It is never
 * logged, never put in a URL, and never rendered by a server component, because
 * a server-rendered secret would sit in the RSC payload and in any HTML cache.
 */
export async function revealCredential(
  input: unknown,
): Promise<
  ActionResult<{ username: string | null; secret: string; notes: string | null }>
> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  // Every active role may reveal, by decision. The access log is the
  // accountability mechanism, not the permission.
  if (!can(actor, "reveal", "credential")) {
    return fail("You do not have permission to reveal credentials.");
  }

  const parsed = revealCredentialSchema.safeParse(input);
  if (!parsed.success) return fail("That credential is not valid.");

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("reveal_credential", {
    p_credential_id: parsed.data.id,
  });

  if (error) return fail(error.message);

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return fail("That credential does not exist.");

  // Repaint the page so "Last viewed by ..." reflects the reveal that just
  // happened. The secret itself is in the return value only.
  revalidatePath("/projects");

  return ok({
    username: row.username ?? null,
    secret: row.secret ?? "",
    notes: row.notes ?? null,
  });
}

export async function setCredentialDeleted(
  input: unknown,
): Promise<ActionResult<undefined>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!can(actor, "delete", "credential")) {
    return fail("You do not have permission to delete a credential.");
  }

  const parsed = deleteCredentialSchema.safeParse(input);
  if (!parsed.success) return fail("That credential is not valid.");

  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_credential", {
    p_id: parsed.data.id,
    p_deleted: parsed.data.deleted,
  });

  if (error) return fail(error.message);

  revalidatePath("/projects");
  return ok();
}

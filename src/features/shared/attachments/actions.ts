"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const downloadSchema = z.object({ id: z.uuid() });
const removeSchema = z.object({ id: z.uuid() });

/**
 * Hands back a signed URL that expires in 60 seconds.
 *
 * SYSTEM_DESIGN 7.4: no public URLs anywhere. A signed URL is generated on
 * demand, used immediately, and is useless by the time it could leak out of a
 * browser history or a chat message. It is never stored on the attachment row.
 */
export async function getDownloadUrl(
  input: unknown,
): Promise<ActionResult<{ url: string; fileName: string }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }

  const parsed = downloadSchema.safeParse(input);
  if (!parsed.success) return fail("That file is not valid.");

  const supabase = await createClient();

  // Read through the user-scoped client, so RLS decides whether this user may
  // see the row at all before any URL is signed.
  const { data: attachment } = await supabase
    .from("attachments")
    .select("bucket, storage_path, file_name")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!attachment) return fail("That file no longer exists.");

  const { data, error } = await supabase.storage
    .from(attachment.bucket)
    .createSignedUrl(attachment.storage_path, 60);

  if (error || !data) {
    return fail(error?.message ?? "Could not prepare that download.");
  }

  return ok({ url: data.signedUrl, fileName: attachment.file_name });
}

/**
 * Soft-deletes the attachment row.
 *
 * The object is deliberately left in the bucket. Storage is not transactional
 * with the database, so deleting the file first and failing the row update
 * would leave a row pointing at nothing — a broken download instead of a
 * recoverable mistake. A future sweep can remove objects whose rows have been
 * deleted for long enough.
 */
export async function removeAttachment(
  input: unknown,
): Promise<ActionResult<undefined>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }

  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return fail("That file is not valid.");

  const supabase = await createClient();

  const { data: attachment } = await supabase
    .from("attachments")
    .select("entity_type, entity_id")
    .eq("id", parsed.data.id)
    .maybeSingle();

  const { error } = await supabase
    .from("attachments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.id);

  // The trigger raises for someone else's file unless they are a manager.
  if (error) return fail(error.message);

  if (attachment) {
    const base =
      attachment.entity_type === "project" ? "/projects" : "/contacts";
    revalidatePath(`${base}/${attachment.entity_id}`);
  }

  return ok();
}

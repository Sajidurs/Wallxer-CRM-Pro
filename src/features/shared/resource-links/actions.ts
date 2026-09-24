"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFromZod, firstIssueMessage } from "@/lib/zod";

import {
  deleteResourceLinkSchema,
  resourceLinkSchema,
} from "./schema";

function pathFor(entityType: string, entityId: string) {
  switch (entityType) {
    case "project":
      return `/projects/${entityId}`;
    case "contact":
      return `/contacts/${entityId}`;
    case "task":
      return `/tasks/${entityId}`;
    default:
      return "/";
  }
}

export async function addResourceLink(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }

  const parsed = resourceLinkSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("resource_links")
    .insert({
      workspace_id: actor.workspace_id,
      entity_type: parsed.data.entityType,
      entity_id: parsed.data.entityId,
      kind: parsed.data.kind,
      name: parsed.data.name,
      url: parsed.data.url,
      created_by: actor.id,
    })
    .select("id")
    .single();

  if (error) return fail(error.message);

  revalidatePath(pathFor(parsed.data.entityType, parsed.data.entityId));
  return ok({ id: data.id });
}

export async function deleteResourceLink(
  input: unknown,
): Promise<ActionResult<undefined>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }

  const parsed = deleteResourceLinkSchema.safeParse(input);
  if (!parsed.success) return fail("That link is not valid.");

  const supabase = await createClient();

  // Read first so the right page can be revalidated once the row is gone.
  const { data: link } = await supabase
    .from("resource_links")
    .select("entity_type, entity_id")
    .eq("id", parsed.data.id)
    .maybeSingle();

  const { error } = await supabase
    .from("resource_links")
    .delete()
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  if (link) revalidatePath(pathFor(link.entity_type, link.entity_id));
  return ok();
}

"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { fieldErrorsFromZod, firstIssueMessage } from "@/lib/zod";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

import {
  contactSchema,
  deleteContactSchema,
  updateContactSchema,
  type ContactValues,
} from "./schema";

/**
 * Maps validated form values onto database columns.
 *
 * One place, used by create and update, so the two cannot drift. The type
 * decides which name fields survive: keeping a stale company_name on a person
 * makes `displayName` lie later.
 */
function toRow(values: ContactValues) {
  const isCompany = values.type === "company";

  return {
    type: values.type,
    first_name: isCompany ? null : values.firstName,
    last_name: isCompany ? null : values.lastName,
    company_name: values.companyName,
    job_title: values.jobTitle,
    email: values.email,
    phone: values.phone,
    whatsapp: values.whatsapp,
    website: values.website,
    brand_id: values.brandId,
    owner_id: values.ownerId,
    // A company cannot belong to a company in v1; the field is not shown for
    // one, and dropping it here stops a stale value surviving a type change.
    parent_contact_id: isCompany ? null : values.parentContactId,
    status: values.status,
    source: values.source,
    tags: values.tags,
    notes: values.notes,
    address: values.address,
  };
}

export async function createContact(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!can(actor, "create", "contact")) {
    return fail("You do not have permission to create a contact.");
  }

  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      firstIssueMessage(parsed.error),
      fieldErrorsFromZod(parsed.error),
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      ...toRow(parsed.data),
      workspace_id: actor.workspace_id,
      created_by: actor.id,
    })
    .select("id")
    .single();

  if (error) return fail(error.message);

  revalidatePath("/contacts");
  return ok({ id: data.id });
}

export async function updateContact(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!can(actor, "update", "contact")) {
    return fail("You do not have permission to edit a contact.");
  }

  const parsed = updateContactSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      firstIssueMessage(parsed.error),
      fieldErrorsFromZod(parsed.error),
    );
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("contacts")
    .update(toRow(parsed.data.values))
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${parsed.data.id}`);
  return ok({ id: parsed.data.id });
}

/**
 * Soft delete, and its undo.
 *
 * Nothing is hard deleted — there is no DELETE policy on the table at all, so
 * this is the only removal path that exists. The trigger in migration 0004
 * rejects it for members; the check below just avoids a round trip to be told
 * so.
 */
export async function setContactDeleted(
  input: unknown,
): Promise<ActionResult<{ id: string; deleted: boolean }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!can(actor, "delete", "contact")) {
    return fail("Only a manager or above can delete a contact.");
  }

  const parsed = deleteContactSchema.safeParse(input);
  if (!parsed.success) return fail("That contact is not valid.");

  const supabase = await createClient();

  const { error } = await supabase
    .from("contacts")
    .update({ deleted_at: parsed.data.deleted ? new Date().toISOString() : null })
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${parsed.data.id}`);
  return ok({ id: parsed.data.id, deleted: parsed.data.deleted });
}

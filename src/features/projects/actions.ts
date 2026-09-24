"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFromZod, firstIssueMessage } from "@/lib/zod";

import {
  deleteProjectSchema,
  deleteWebsiteSchema,
  projectSchema,
  updateProjectSchema,
  websiteSchema,
  type ProjectValues,
} from "./schema";

function toRow(values: ProjectValues) {
  return {
    name: values.name,
    // Codes are compared case-insensitively by the unique index, so store them
    // the way they will be matched.
    code: values.code ? values.code.toUpperCase() : null,
    description: values.description,
    status: values.status,
    contact_id: values.contactId,
    brand_id: values.brandId,
    owner_id: values.ownerId,
    start_date: values.startDate,
    due_date: values.dueDate,
  };
}

/** The unique index on (workspace_id, upper(code)) surfaces as 23505. */
function friendlyError(message: string, code?: string) {
  if (code === "23505" && message.includes("projects_workspace_code_key")) {
    return "Another project already uses that code.";
  }
  return message;
}

export async function createProject(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!can(actor, "create", "project")) {
    return fail("You do not have permission to create a project.");
  }

  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      ...toRow(parsed.data),
      workspace_id: actor.workspace_id,
      created_by: actor.id,
    })
    .select("id")
    .single();

  if (error) return fail(friendlyError(error.message, error.code));

  revalidatePath("/projects");
  return ok({ id: data.id });
}

export async function updateProject(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!can(actor, "update", "project")) {
    return fail("You do not have permission to edit a project.");
  }

  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("projects")
    .update(toRow(parsed.data.values))
    .eq("id", parsed.data.id);

  if (error) return fail(friendlyError(error.message, error.code));

  revalidatePath("/projects");
  revalidatePath(`/projects/${parsed.data.id}`);
  return ok({ id: parsed.data.id });
}

export async function setProjectDeleted(
  input: unknown,
): Promise<ActionResult<{ id: string; deleted: boolean }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!can(actor, "delete", "project")) {
    return fail("Only a manager or above can delete a project.");
  }

  const parsed = deleteProjectSchema.safeParse(input);
  if (!parsed.success) return fail("That project is not valid.");

  const supabase = await createClient();

  const { error } = await supabase
    .from("projects")
    .update({ deleted_at: parsed.data.deleted ? new Date().toISOString() : null })
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidatePath("/projects");
  revalidatePath(`/projects/${parsed.data.id}`);
  return ok({ id: parsed.data.id, deleted: parsed.data.deleted });
}

// ---------------------------------------------------------------------------
// Websites
// ---------------------------------------------------------------------------

export async function addWebsite(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!can(actor, "update", "project")) {
    return fail("You do not have permission to edit this project.");
  }

  const parsed = websiteSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_websites")
    .insert({
      project_id: parsed.data.projectId,
      workspace_id: actor.workspace_id,
      label: parsed.data.label,
      url: parsed.data.url,
      environment: parsed.data.environment,
      notes: parsed.data.notes,
      created_by: actor.id,
    })
    .select("id")
    .single();

  if (error) return fail(error.message);

  revalidatePath(`/projects/${parsed.data.projectId}`);
  return ok({ id: data.id });
}

export async function deleteWebsite(
  input: unknown,
): Promise<ActionResult<undefined>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!can(actor, "update", "project")) {
    return fail("You do not have permission to edit this project.");
  }

  const parsed = deleteWebsiteSchema.safeParse(input);
  if (!parsed.success) return fail("That link is not valid.");

  const supabase = await createClient();

  // Read the project id first so the right page can be revalidated after the
  // row is gone.
  const { data: row } = await supabase
    .from("project_websites")
    .select("project_id")
    .eq("id", parsed.data.id)
    .maybeSingle();

  const { error } = await supabase
    .from("project_websites")
    .delete()
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  if (row) revalidatePath(`/projects/${row.project_id}`);
  return ok();
}

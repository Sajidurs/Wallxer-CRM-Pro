"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { atLeast, canEditTask } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFromZod, firstIssueMessage } from "@/lib/zod";

import {
  deleteTaskSchema,
  moveTaskSchema,
  taskSchema,
  updateTaskSchema,
  type TaskValues,
} from "./schema";

function toRow(values: TaskValues) {
  return {
    title: values.title,
    description: values.description,
    status: values.status,
    priority: values.priority,
    project_id: values.projectId,
    contact_id: values.contactId,
    start_at: values.startAt,
    due_at: values.dueAt,
    estimated_minutes: values.estimatedMinutes,
  };
}

function revalidateTask(taskId: string, projectId?: string | null) {
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

export async function createTask(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }

  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      ...toRow(parsed.data),
      workspace_id: actor.workspace_id,
      created_by: actor.id,
    })
    .select("id")
    .single();

  if (error) return fail(error.message);

  const taskId = data.id;

  // Assignment is a separate table, and the policy lets a non-manager set
  // assignees only on a task they created — which is exactly this moment.
  if (parsed.data.assigneeId) {
    const { error: assignError } = await supabase.from("task_assignees").insert({
      task_id: taskId,
      user_id: parsed.data.assigneeId,
      workspace_id: actor.workspace_id,
      assigned_by: actor.id,
    });

    if (assignError) {
      return fail(`Task created, but it could not be assigned: ${assignError.message}`);
    }
  }

  if (parsed.data.links.length > 0) {
    const { error: linkError } = await supabase.from("resource_links").insert(
      parsed.data.links.map((link, index) => ({
        workspace_id: actor.workspace_id,
        entity_type: "task",
        entity_id: taskId,
        kind: link.kind,
        name: link.name,
        url: link.url,
        position: index,
        created_by: actor.id,
      })),
    );

    if (linkError) {
      return fail(`Task created, but its links were not saved: ${linkError.message}`);
    }
  }

  revalidateTask(taskId, parsed.data.projectId);
  return ok({ id: taskId });
}

export async function updateTask(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }

  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const supabase = await createClient();

  // Checked here for a clear message; `guard_task_edit` enforces it regardless,
  // which is what protects a direct PATCH that never reaches this function.
  const { data: existingAssignees } = await supabase
    .from("task_assignees")
    .select("user_id")
    .eq("task_id", parsed.data.id);

  const assigneeIds = (existingAssignees ?? []).map((row) => row.user_id);

  if (!canEditTask(actor, { assigneeIds })) {
    return fail("You can only edit tasks assigned to you.");
  }

  const { error } = await supabase
    .from("tasks")
    .update(toRow(parsed.data.values))
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  // Reassignment is manager work. A member editing their own task keeps the
  // assignment it already has rather than being silently unassigned.
  const wantedAssignee = parsed.data.values.assigneeId;
  const currentAssignee = assigneeIds[0] ?? null;

  if (wantedAssignee !== currentAssignee && atLeast(actor.role, "manager")) {
    await supabase.from("task_assignees").delete().eq("task_id", parsed.data.id);

    if (wantedAssignee) {
      const { error: assignError } = await supabase.from("task_assignees").insert({
        task_id: parsed.data.id,
        user_id: wantedAssignee,
        workspace_id: actor.workspace_id,
        assigned_by: actor.id,
      });
      if (assignError) return fail(assignError.message);
    }
  }

  // Links are replaced wholesale rather than diffed. The form owns the whole
  // list, the rows carry no state worth preserving beyond name, url and kind,
  // and a diff would be more code with more ways to go wrong.
  await supabase
    .from("resource_links")
    .delete()
    .eq("entity_type", "task")
    .eq("entity_id", parsed.data.id);

  if (parsed.data.values.links.length > 0) {
    const { error: linkError } = await supabase.from("resource_links").insert(
      parsed.data.values.links.map((link, index) => ({
        workspace_id: actor.workspace_id,
        entity_type: "task",
        entity_id: parsed.data.id,
        kind: link.kind,
        name: link.name,
        url: link.url,
        position: index,
        created_by: actor.id,
      })),
    );

    if (linkError) {
      return fail(`Task saved, but its links were not: ${linkError.message}`);
    }
  }

  revalidateTask(parsed.data.id, parsed.data.values.projectId);
  return ok({ id: parsed.data.id });
}

/**
 * Board drag and drop: status and ordering only.
 *
 * Separate from `updateTask` because a drag should not have to send, and so
 * cannot accidentally overwrite, every other field on the task.
 */
export async function moveTask(
  input: unknown,
): Promise<ActionResult<undefined>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }

  const parsed = moveTaskSchema.safeParse(input);
  if (!parsed.success) return fail("That move is not valid.");

  const supabase = await createClient();

  const { data: assignees } = await supabase
    .from("task_assignees")
    .select("user_id")
    .eq("task_id", parsed.data.id);

  if (!canEditTask(actor, { assigneeIds: (assignees ?? []).map((r) => r.user_id) })) {
    return fail("You can only move tasks assigned to you.");
  }

  const { error } = await supabase
    .from("tasks")
    .update({ status: parsed.data.status, position: parsed.data.position })
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidatePath("/tasks");
  return ok();
}

export async function setTaskDeleted(
  input: unknown,
): Promise<ActionResult<{ id: string; deleted: boolean }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!atLeast(actor.role, "manager")) {
    return fail("Only a manager or above can delete a task.");
  }

  const parsed = deleteTaskSchema.safeParse(input);
  if (!parsed.success) return fail("That task is not valid.");

  const supabase = await createClient();

  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: parsed.data.deleted ? new Date().toISOString() : null })
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidateTask(parsed.data.id);
  return ok({ id: parsed.data.id, deleted: parsed.data.deleted });
}

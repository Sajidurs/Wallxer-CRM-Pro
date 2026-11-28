import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { atLeast } from "@/lib/permissions";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  checklistItemSchema,
  midpoint,
  taskSchema,
  toggleChecklistItemSchema,
  updateTaskSchema,
  type TaskValues,
} from "@/features/tasks/schema";

import { limitField, pageField } from "../paging";
import { assertFound, assertOk, likePattern, pageWindow, parseWith, registerTool } from "../register-tool";

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
    estimated_minutes:
      values.estimatedHours === null ? null : Math.round(values.estimatedHours * 60),
  };
}

const moveTaskSchema = z.object({
  id: z.uuid(),
  status: z.enum(TASK_STATUSES),
  position: z
    .number()
    .finite()
    .optional()
    .describe("Omit to keep the current order and only change status"),
});

export function registerTaskTools(server: McpServer) {
  registerTool(
    server,
    "search_tasks",
    "Search tasks by title. Filter by status, priority, project, or assignee. Deleted tasks are omitted.",
    z.object({
      q: z.string().trim().max(120).optional(),
      status: z.enum(TASK_STATUSES).optional(),
      priority: z.enum(TASK_PRIORITIES).optional(),
      projectId: z.uuid().optional(),
      assigneeId: z.uuid().optional(),
      page: pageField,
      limit: limitField,
    }),
    { kind: "read" },
    null,
    async (ctx, input) => {
      let assigneeTaskIds: string[] | null = null;
      if (input.assigneeId) {
        const { data, error } = await ctx.db
          .from("task_assignees")
          .select("task_id")
          .eq("user_id", input.assigneeId);
        assertOk(error);
        assigneeTaskIds = (data ?? []).map((row) => row.task_id);
        if (assigneeTaskIds.length === 0) {
          return { tasks: [], total: 0, page: input.page, limit: input.limit };
        }
      }

      const { from, to } = pageWindow(input.page, input.limit);
      let query = ctx.db
        .from("tasks")
        .select(
          "id, title, status, priority, project_id, contact_id, due_at, start_at, updated_at",
          { count: "exact" },
        )
        .is("deleted_at", null);
      if (assigneeTaskIds) query = query.in("id", assigneeTaskIds);
      if (input.q) query = query.ilike("title", likePattern(input.q));
      if (input.status) query = query.eq("status", input.status);
      if (input.priority) query = query.eq("priority", input.priority);
      if (input.projectId) query = query.eq("project_id", input.projectId);

      const { data, error, count } = await query
        .order("due_at", { ascending: true, nullsFirst: false })
        .range(from, to);
      assertOk(error);
      return { tasks: data ?? [], total: count ?? 0, page: input.page, limit: input.limit };
    },
  );

  registerTool(
    server,
    "get_task",
    "One task, its assignees, and its checklist. estimated_minutes is the stored unit; the form thinks in hours.",
    z.object({ id: z.uuid() }),
    { kind: "read" },
    "task",
    async (ctx, input) => {
      const { data, error } = await ctx.db
        .from("tasks")
        .select(
          "id, title, description, status, priority, project_id, contact_id, parent_task_id, start_at, due_at, estimated_minutes, actual_minutes, position, completed_at, created_at, updated_at",
        )
        .eq("id", input.id)
        .is("deleted_at", null)
        .maybeSingle();
      assertOk(error);
      assertFound(data, "task");
      const task = data;

      const [{ data: assignees, error: assigneeError }, { data: checklist, error: checkError }] =
        await Promise.all([
          ctx.db
            .from("task_assignees")
            .select("user_id, assigned_by, created_at")
            .eq("task_id", task.id),
          ctx.db
            .from("task_checklist_items")
            .select("id, title, is_done, position, completed_at")
            .eq("task_id", task.id)
            .order("position", { ascending: true }),
        ]);
      assertOk(assigneeError);
      assertOk(checkError);
      return { ...task, assignees: assignees ?? [], checklist: checklist ?? [] };
    },
  );

  registerTool(
    server,
    "create_task",
    "Create a task. status is todo, in_progress, review, blocked, or done. priority is low, medium, high, or urgent. estimatedHours is hours (stored as minutes). assigneeId is optional. links are optional and only written on create; later links use add_resource_link. Same validation as the task form.",
    taskSchema,
    { kind: "write", resource: "task", action: "create" },
    "task",
    async (ctx, input) => {
      const values = parseWith(taskSchema, input);
      const { data, error } = await ctx.db
        .from("tasks")
        .insert({
          ...toRow(values),
          workspace_id: ctx.profile.workspace_id,
          created_by: ctx.profile.id,
        })
        .select("id")
        .single();
      assertOk(error);
      assertFound(data, "task");

      if (values.assigneeId) {
        const { error: assignError } = await ctx.db.from("task_assignees").insert({
          task_id: data.id,
          user_id: values.assigneeId,
          workspace_id: ctx.profile.workspace_id,
          assigned_by: ctx.profile.id,
        });
        if (assignError) {
          throw new Error(`Task created, but it could not be assigned: ${assignError.message}`);
        }
      }

      if (values.links.length > 0) {
        const { error: linkError } = await ctx.db.from("resource_links").insert(
          values.links.map((link, index) => ({
            workspace_id: ctx.profile.workspace_id,
            entity_type: "task" as const,
            entity_id: data.id,
            kind: link.kind,
            name: link.name,
            url: link.url,
            position: index,
            created_by: ctx.profile.id,
          })),
        );
        if (linkError) {
          throw new Error(`Task created, but its links were not saved: ${linkError.message}`);
        }
      }

      return data;
    },
  );

  registerTool(
    server,
    "update_task",
    "Replace a task's title, description, status, priority, dates, estimate, project, and contact. Pass id and values; values matches create_task. Assignee changes require a manager profile and replace the single assignee. Links in values are ignored — use add_resource_link. Does not delete the task.",
    updateTaskSchema,
    { kind: "write", resource: "task", action: "update" },
    "task",
    async (ctx, input) => {
      const parsed = parseWith(updateTaskSchema, input);
      const { data: current, error: currentError } = await ctx.db
        .from("task_assignees")
        .select("user_id")
        .eq("task_id", parsed.id);
      assertOk(currentError);
      const currentAssignee = current?.[0]?.user_id ?? null;
      const wanted = parsed.values.assigneeId;
      if (wanted !== currentAssignee && !atLeast(ctx.profile.role, "manager")) {
        throw new Error("Only a manager can change who a task is assigned to.");
      }

      const { data, error } = await ctx.db
        .from("tasks")
        .update(toRow(parsed.values))
        .eq("id", parsed.id)
        .eq("workspace_id", ctx.profile.workspace_id)
        .select("id")
        .maybeSingle();
      assertOk(error);
      assertFound(data, "task");

      if (wanted !== currentAssignee) {
        const { error: clearError } = await ctx.db
          .from("task_assignees")
          .delete()
          .eq("task_id", parsed.id);
        assertOk(clearError);
        if (wanted) {
          const { error: assignError } = await ctx.db.from("task_assignees").insert({
            task_id: parsed.id,
            user_id: wanted,
            workspace_id: ctx.profile.workspace_id,
            assigned_by: ctx.profile.id,
          });
          assertOk(assignError);
        }
      }

      return data;
    },
  );

  registerTool(
    server,
    "move_task",
    "Change a task's status, and optionally its board position. Omit position to leave the order alone. Does not change any other field.",
    moveTaskSchema,
    { kind: "write", resource: "task", action: "update" },
    "task",
    async (ctx, input) => {
      const parsed = parseWith(moveTaskSchema, input);
      const patch: { status: (typeof parsed)["status"]; position?: number } = {
        status: parsed.status,
      };
      if (parsed.position !== undefined) patch.position = parsed.position;

      const { data, error } = await ctx.db
        .from("tasks")
        .update(patch)
        .eq("id", parsed.id)
        .eq("workspace_id", ctx.profile.workspace_id)
        .select("id, status, position")
        .maybeSingle();
      assertOk(error);
      assertFound(data, "task");
      return data;
    },
  );

  registerTool(
    server,
    "add_checklist_item",
    "Append a checklist item to a task. There is no delete tool for items.",
    checklistItemSchema,
    { kind: "write", resource: "task", action: "update" },
    "task_checklist_item",
    async (ctx, input) => {
      const values = parseWith(checklistItemSchema, input);
      const { data: last, error: lastError } = await ctx.db
        .from("task_checklist_items")
        .select("position")
        .eq("task_id", values.taskId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      assertOk(lastError);

      const { data, error } = await ctx.db
        .from("task_checklist_items")
        .insert({
          workspace_id: ctx.profile.workspace_id,
          task_id: values.taskId,
          title: values.title,
          position: midpoint(last?.position ?? null, null),
          created_by: ctx.profile.id,
        })
        .select("id")
        .single();
      assertOk(error);
      assertFound(data, "checklist item");
      return { id: data.id, task_id: values.taskId };
    },
  );

  registerTool(
    server,
    "set_checklist_item_done",
    "Mark a checklist item done or not done. completed_at is maintained by the database.",
    toggleChecklistItemSchema,
    { kind: "write", resource: "task", action: "update" },
    "task_checklist_item",
    async (ctx, input) => {
      const parsed = parseWith(toggleChecklistItemSchema, input);
      const { data, error } = await ctx.db
        .from("task_checklist_items")
        .update({ is_done: parsed.isDone })
        .eq("id", parsed.id)
        .eq("workspace_id", ctx.profile.workspace_id)
        .select("id, task_id, is_done")
        .maybeSingle();
      assertOk(error);
      assertFound(data, "checklist item");
      return data;
    },
  );
}

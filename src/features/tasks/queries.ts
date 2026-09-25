import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

import { PAGE_SIZE, type TaskFilters } from "./schema";

export type Task = Tables<"tasks">;

const LIST_COLUMNS = `
  id, title, description, status, priority, project_id, contact_id,
  start_at, due_at, estimated_minutes, completed_at, position,
  created_at, updated_at, created_by, deleted_at
`;

/** Ticked over total. The board draws a bar from this; nothing stores a percent. */
export interface ChecklistProgress {
  done: number;
  total: number;
}

export type TaskListItem = Pick<
  Task,
  | "id"
  | "title"
  | "description"
  | "status"
  | "priority"
  | "project_id"
  | "contact_id"
  | "start_at"
  | "due_at"
  | "estimated_minutes"
  | "completed_at"
  | "position"
  | "created_at"
  | "updated_at"
  | "created_by"
  | "deleted_at"
> & { assigneeIds: string[]; checklist: ChecklistProgress };

export interface TaskListResult {
  tasks: TaskListItem[];
  total: number;
  page: number;
  pageCount: number;
}

/** Priority is an enum, so ordering by it sorts alphabetically, not by weight. */
const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * The two things a task row cannot carry itself: who it is assigned to, and
 * how much of its checklist is ticked.
 *
 * Both are one query for the whole page rather than one per task. A board of
 * 500 cards would otherwise be 1000 round trips to Seoul.
 */
async function attachDetails(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tasks: Omit<TaskListItem, "assigneeIds" | "checklist">[],
): Promise<TaskListItem[]> {
  if (tasks.length === 0) return [];

  const ids = tasks.map((task) => task.id);

  const [{ data: assignees }, { data: items }] = await Promise.all([
    supabase.from("task_assignees").select("task_id, user_id").in("task_id", ids),
    supabase
      .from("task_checklist_items")
      .select("task_id, is_done")
      .in("task_id", ids),
  ]);

  const byTask = new Map<string, string[]>();
  for (const row of assignees ?? []) {
    const list = byTask.get(row.task_id) ?? [];
    list.push(row.user_id);
    byTask.set(row.task_id, list);
  }

  const progress = new Map<string, ChecklistProgress>();
  for (const row of items ?? []) {
    const current = progress.get(row.task_id) ?? { done: 0, total: 0 };
    current.total += 1;
    if (row.is_done) current.done += 1;
    progress.set(row.task_id, current);
  }

  return tasks.map((task) => ({
    ...task,
    assigneeIds: byTask.get(task.id) ?? [],
    checklist: progress.get(task.id) ?? { done: 0, total: 0 },
  }));
}

export async function listTasks(filters: TaskFilters): Promise<TaskListResult> {
  const supabase = await createClient();

  // Assignee is a filter on a junction table, so the matching task ids are
  // resolved first rather than forcing an inner join that would also change
  // what `count: exact` reports.
  let assigneeTaskIds: string[] | null = null;
  if (filters.assigneeId) {
    const { data } = await supabase
      .from("task_assignees")
      .select("task_id")
      .eq("user_id", filters.assigneeId);
    assigneeTaskIds = (data ?? []).map((row) => row.task_id);
    if (assigneeTaskIds.length === 0) {
      return { tasks: [], total: 0, page: filters.page, pageCount: 1 };
    }
  }

  let query = supabase
    .from("tasks")
    .select(LIST_COLUMNS, { count: "exact" })
    .is("deleted_at", null);

  if (assigneeTaskIds) query = query.in("id", assigneeTaskIds);

  if (filters.q) {
    const term = `%${filters.q.replace(/[%_]/g, "\\$&")}%`;
    query = query.ilike("title", term);
  }

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);

  const now = new Date();
  switch (filters.due) {
    case "overdue":
      // Done tasks are never overdue, however late they were finished.
      query = query.lt("due_at", now.toISOString()).neq("status", "done");
      break;
    case "today": {
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.gte("due_at", now.toISOString()).lte("due_at", endOfDay.toISOString());
      break;
    }
    case "week": {
      const weekOut = new Date(now);
      weekOut.setDate(weekOut.getDate() + 7);
      query = query.gte("due_at", now.toISOString()).lte("due_at", weekOut.toISOString());
      break;
    }
    case "none":
      query = query.is("due_at", null);
      break;
  }

  switch (filters.sort) {
    case "recent":
      query = query.order("created_at", { ascending: false });
      break;
    case "priority":
      // Sorted properly in JavaScript below; this only makes the page stable.
      query = query.order("created_at", { ascending: false });
      break;
    default:
      query = query.order("due_at", { ascending: true, nullsFirst: false });
  }

  const from = (filters.page - 1) * PAGE_SIZE;
  query = query.range(from, from + PAGE_SIZE - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(`Could not load tasks: ${error.message}`);

  let rows = (data ?? []) as Omit<TaskListItem, "assigneeIds" | "checklist">[];

  if (filters.sort === "priority") {
    rows = [...rows].sort(
      (a, b) => (PRIORITY_WEIGHT[a.priority] ?? 9) - (PRIORITY_WEIGHT[b.priority] ?? 9),
    );
  }

  const total = count ?? 0;

  return {
    tasks: await attachDetails(supabase, rows),
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Every live task, ordered for the board. Columns are grouped client-side. */
export async function listBoardTasks(
  filters: TaskFilters,
): Promise<TaskListItem[]> {
  const supabase = await createClient();

  let assigneeTaskIds: string[] | null = null;
  if (filters.assigneeId) {
    const { data } = await supabase
      .from("task_assignees")
      .select("task_id")
      .eq("user_id", filters.assigneeId);
    assigneeTaskIds = (data ?? []).map((row) => row.task_id);
    if (assigneeTaskIds.length === 0) return [];
  }

  let query = supabase
    .from("tasks")
    .select(LIST_COLUMNS)
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .limit(500);

  if (assigneeTaskIds) query = query.in("id", assigneeTaskIds);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.q) {
    query = query.ilike("title", `%${filters.q.replace(/[%_]/g, "\\$&")}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Could not load the board: ${error.message}`);

  return attachDetails(supabase, (data ?? []) as Omit<TaskListItem, "assigneeIds" | "checklist">[]);
}

export async function getTask(id: string): Promise<(Task & { assigneeIds: string[] }) | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return null;

  const { data: assignees } = await supabase
    .from("task_assignees")
    .select("user_id")
    .eq("task_id", id);

  return { ...data, assigneeIds: (assignees ?? []).map((row) => row.user_id) };
}

/** Tasks for one project or contact, for their detail tabs. */
export async function listTasksFor(
  column: "project_id" | "contact_id",
  id: string,
): Promise<TaskListItem[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("tasks")
    .select(LIST_COLUMNS)
    .eq(column, id)
    .is("deleted_at", null)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(200);

  return attachDetails(supabase, (data ?? []) as Omit<TaskListItem, "assigneeIds" | "checklist">[]);
}

export type ChecklistItem = Tables<"task_checklist_items">;

/** One task's checklist, in board order. */
export async function listChecklistItems(
  taskId: string,
): Promise<ChecklistItem[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("task_checklist_items")
    .select("*")
    .eq("task_id", taskId)
    .order("position", { ascending: true });

  return data ?? [];
}

import { z } from "zod";

import { draftLinkSchema } from "@/features/shared/resource-links/schema";
import { optionalId, optionalText } from "@/lib/zod";

export const TASK_STATUSES = ["todo", "in_progress", "review", "blocked", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "In review",
  blocked: "Blocked",
  done: "Done",
};

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

/**
 * A `datetime-local` input sends "2026-09-24T14:30" with no zone, and "" when
 * cleared. Stored as timestamptz, so the browser's zone is applied on the way
 * in — which is what the person meant when they typed it.
 */
const optionalDateTime = () =>
  z
    .string()
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim();
      if (!trimmed) return null;
      const parsed = new Date(trimmed);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    });

export const taskSchema = z
  .object({
    title: z
      .string()
      .min(2, "Give the task a title")
      .max(200, "That title is too long")
      .transform((value) => value.trim()),
    description: optionalText(5000, "That description is too long"),
    status: z.enum(TASK_STATUSES),
    priority: z.enum(TASK_PRIORITIES),
    projectId: optionalId(),
    contactId: optionalId(),
    assigneeId: optionalId(),
    startAt: optionalDateTime(),
    dueAt: optionalDateTime(),
    // A number input sends a string, the database wants an int, and clearing
    // the field sends "". `.optional()` on the union rather than a
    // `z.undefined()` member: in Zod 4 a union containing undefined still
    // requires the key to be present, so omitting it entirely was rejected.
    estimatedMinutes: z
      .union([z.string(), z.number(), z.null()])
      .optional()
      .transform((value) => {
        if (value === null || value === undefined || value === "") return null;
        const n = typeof value === "number" ? value : Number(value);
        return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
      })
      .refine(
        (value) => value === null || value <= 100000,
        "That estimate is unrealistically large",
      ),
    links: z.array(draftLinkSchema).max(25, "That is a lot of links").default([]),
  })
  .refine(
    (values) => !values.startAt || !values.dueAt || values.dueAt >= values.startAt,
    { message: "The due time cannot be before the start time", path: ["dueAt"] },
  );

export type TaskInput = z.input<typeof taskSchema>;
export type TaskValues = z.output<typeof taskSchema>;

export const updateTaskSchema = z.object({
  id: z.uuid(),
  values: taskSchema,
});

export const deleteTaskSchema = z.object({
  id: z.uuid(),
  deleted: z.boolean().default(true),
});

/** Used by the board, where only the status and ordering change. */
export const moveTaskSchema = z.object({
  id: z.uuid(),
  status: z.enum(TASK_STATUSES),
  position: z.number().finite(),
});

export const taskFiltersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigneeId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  brandId: z.uuid().optional(),
  /** Relative windows, resolved against now() in the query. */
  due: z.enum(["overdue", "today", "week", "none"]).optional(),
  view: z.enum(["list", "board"]).default("board"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  sort: z.enum(["due", "priority", "recent"]).default("due"),
});

export type TaskFilters = z.output<typeof taskFiltersSchema>;

export const PAGE_SIZE = 50;

/**
 * Midpoint ordering for drag and drop.
 *
 * Dropping between two cards averages their positions, so exactly one row is
 * written. Numbers do run out of precision after enough drops into the same
 * gap; when two neighbours end up closer than this, the column needs
 * renumbering. That is a Phase 7 concern, not a v1 one.
 */
export function midpoint(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1000;
  if (before === null) return after! - 1000;
  if (after === null) return before + 1000;
  return (before + after) / 2;
}

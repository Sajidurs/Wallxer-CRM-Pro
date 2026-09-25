"use client";

import { format, isPast } from "date-fns";
import { CalendarDays, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Pill, type PillTone } from "@/components/common/pill";
import { cn } from "@/lib/utils";

import { moveTask } from "../actions";
import type { TaskListItem } from "../queries";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  midpoint,
  type TaskPriority,
  type TaskStatus,
} from "../schema";
import { TaskActions } from "./task-actions";

interface TaskBoardProps {
  tasks: TaskListItem[];
  people: Record<string, string>;
  currentUserId: string;
  isManager: boolean;
}

const PRIORITY_TONE: Record<TaskPriority, PillTone> = {
  urgent: "red",
  high: "amber",
  medium: "purple",
  low: "blue",
};

/**
 * Each column is tinted by what it means, faintly enough that five of them
 * side by side still read as one surface. The dot in the heading carries the
 * same hue at full strength, which is what makes the column identifiable when
 * the tint is this quiet.
 */
const COLUMN: Record<TaskStatus, { dot: string; surface: string }> = {
  todo: {
    dot: "bg-[#9B9A97]",
    surface: "bg-muted/40",
  },
  in_progress: {
    dot: "bg-[#5B9DBB]",
    surface: "bg-[#F4F9FC] dark:bg-[#5B9DBB]/8",
  },
  review: {
    dot: "bg-[#9A85BD]",
    surface: "bg-[#F8F6FB] dark:bg-[#9A85BD]/8",
  },
  blocked: {
    dot: "bg-[#C87F73]",
    surface: "bg-[#FDF6F5] dark:bg-[#C87F73]/8",
  },
  done: {
    dot: "bg-[#6FA368]",
    surface: "bg-[#F5F9F4] dark:bg-[#6FA368]/8",
  },
};

/** Two letters, for the assignee chips in the card's corner. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Drag and drop with the HTML5 drag API rather than a library.
 *
 * The board moves one card between five columns; a drag-and-drop library would
 * be more code and another dependency for behaviour the platform already has.
 * Reach for one when multi-select or nested sorting arrives.
 */
export function TaskBoard({
  tasks,
  people,
  currentUserId,
  isManager,
}: TaskBoardProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);

  // Optimistic copy, so a card lands where it was dropped rather than after a
  // round trip. Rolled back by a refresh if the server refuses.
  const [local, setLocal] = useState(tasks);
  const [lastServer, setLastServer] = useState(tasks);

  if (tasks !== lastServer) {
    setLastServer(tasks);
    setLocal(tasks);
  }

  function canMove(task: TaskListItem) {
    return isManager || task.assigneeIds.includes(currentUserId);
  }

  function drop(status: TaskStatus) {
    setOverColumn(null);
    const id = dragging;
    setDragging(null);
    if (!id) return;

    const task = local.find((t) => t.id === id);
    if (!task || task.status === status) return;

    if (!canMove(task)) {
      toast.error("You can only move tasks assigned to you.");
      return;
    }

    const column = local
      .filter((t) => t.status === status && t.id !== id)
      .sort((a, b) => a.position - b.position);
    const position = midpoint(column.at(-1)?.position ?? null, null);

    setLocal((current) =>
      current.map((t) => (t.id === id ? { ...t, status, position } : t)),
    );

    startTransition(async () => {
      const result = await moveTask({ id, status, position });
      if (!result.ok) {
        toast.error(result.error);
        setLocal(lastServer);
        return;
      }
      router.refresh();
    });
  }

  return (
    // Columns keep their width and scroll sideways rather than compressing to
    // five unreadable slivers on a laptop. A Kanban column narrower than its
    // cards is not a Kanban column.
    <div className="-mx-6 flex gap-4 overflow-x-auto px-6 pb-2">
      {TASK_STATUSES.map((status) => {
        const column = local
          .filter((task) => task.status === status)
          .sort((a, b) => a.position - b.position);

        const theme = COLUMN[status];

        return (
          <div
            key={status}
            onDragOver={(event) => {
              event.preventDefault();
              setOverColumn(status);
            }}
            onDragLeave={() => setOverColumn((c) => (c === status ? null : c))}
            onDrop={() => drop(status)}
            className={cn(
              "flex w-[280px] shrink-0 flex-col rounded-xl p-2.5 transition-colors",
              theme.surface,
              overColumn === status && "ring-2 ring-primary/40 ring-inset",
            )}
          >
            <div className="flex items-center gap-2 px-1.5 py-1">
              <span
                className={cn("size-2 shrink-0 rounded-full", theme.dot)}
                aria-hidden
              />
              <span className="text-sm font-medium">
                {TASK_STATUS_LABELS[status]}
              </span>
              <span className="text-sm text-muted-foreground">
                ({column.length})
              </span>

              <Link
                href="/tasks/new"
                aria-label={`New task in ${TASK_STATUS_LABELS[status]}`}
                className="ml-auto flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              >
                <Plus className="size-4" />
              </Link>
            </div>

            <div className="mt-1 flex flex-col gap-2">
              {column.map((task) => {
                const movable = canMove(task);
                const due = task.due_at ? new Date(task.due_at) : null;
                const overdue = due && isPast(due) && task.status !== "done";
                const assignees = task.assigneeIds.slice(0, 3);
                const extra = task.assigneeIds.length - assignees.length;

                return (
                  <div
                    key={task.id}
                    draggable={movable}
                    onDragStart={() => setDragging(task.id)}
                    onDragEnd={() => setDragging(null)}
                    className={cn(
                      "group relative rounded-lg border border-border bg-card p-3 shadow-xs transition-shadow hover:shadow-md",
                      movable ? "cursor-grab active:cursor-grabbing" : "opacity-80",
                      dragging === task.id && "opacity-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Pill tone={PRIORITY_TONE[task.priority as TaskPriority] ?? "grey"}>
                        {TASK_PRIORITY_LABELS[task.priority as TaskPriority] ??
                          task.priority}
                      </Pill>

                      <div className="relative z-10 -mt-1 -mr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <TaskActions
                          taskId={task.id}
                          title={task.title}
                          canEdit={movable}
                          canDelete={isManager}
                        />
                      </div>
                    </div>

                    <Link
                      href={`/tasks/${task.id}`}
                      className="mt-2 block text-sm font-medium leading-snug after:absolute after:inset-0 after:content-[''] group-hover:underline"
                    >
                      <span className="line-clamp-2">{task.title}</span>
                    </Link>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      {due ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-xs",
                            overdue
                              ? "font-medium text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          <CalendarDays className="size-3.5 shrink-0" />
                          {format(due, "d MMM")}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/60">
                          No date
                        </span>
                      )}

                      {assignees.length > 0 && (
                        <span className="flex -space-x-1.5">
                          {assignees.map((id) => (
                            <span
                              key={id}
                              title={people[id] ?? "Someone"}
                              className="flex size-6 items-center justify-center rounded-full bg-sidebar text-[10px] font-semibold text-muted-foreground ring-2 ring-card"
                            >
                              {initials(people[id] ?? "?")}
                            </span>
                          ))}
                          {extra > 0 && (
                            <span className="flex size-6 items-center justify-center rounded-full bg-sidebar text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
                              +{extra}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {column.length === 0 && (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground/70">
                  Nothing here
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

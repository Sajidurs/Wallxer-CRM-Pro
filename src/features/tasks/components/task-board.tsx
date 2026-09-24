"use client";

import { format, isPast } from "date-fns";
import { GripVertical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import { moveTask } from "../actions";
import type { TaskListItem } from "../queries";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  midpoint,
  type TaskStatus,
} from "../schema";

interface TaskBoardProps {
  tasks: TaskListItem[];
  people: Record<string, string>;
  currentUserId: string;
  isManager: boolean;
}

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  urgent: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};

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
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      {TASK_STATUSES.map((status) => {
        const column = local
          .filter((task) => task.status === status)
          .sort((a, b) => a.position - b.position);

        return (
          <div
            key={status}
            onDragOver={(event) => {
              event.preventDefault();
              setOverColumn(status);
            }}
            onDragLeave={() => setOverColumn((c) => (c === status ? null : c))}
            onDrop={() => drop(status)}
            className={`flex min-h-32 flex-col gap-2 rounded-lg border p-2 transition-colors ${
              overColumn === status ? "border-primary bg-primary/5" : "bg-muted/30"
            }`}
          >
            <div className="flex items-center justify-between px-1 py-0.5">
              <span className="text-sm font-medium">{TASK_STATUS_LABELS[status]}</span>
              <span className="text-xs text-muted-foreground">{column.length}</span>
            </div>

            {column.map((task) => {
              const movable = canMove(task);
              const due = task.due_at ? new Date(task.due_at) : null;
              const overdue = due && isPast(due) && task.status !== "done";

              return (
                <Card
                  key={task.id}
                  draggable={movable}
                  onDragStart={() => setDragging(task.id)}
                  onDragEnd={() => setDragging(null)}
                  className={`${movable ? "cursor-grab active:cursor-grabbing" : "opacity-80"} ${
                    dragging === task.id ? "opacity-50" : ""
                  }`}
                >
                  <CardContent className="space-y-2 p-3">
                    <div className="flex items-start gap-1.5">
                      {movable && (
                        <GripVertical className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <Link
                        href={`/tasks/${task.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {task.title}
                      </Link>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={PRIORITY_VARIANT[task.priority] ?? "outline"}
                        className="px-1.5 py-0 text-[10px]"
                      >
                        {task.priority}
                      </Badge>
                      {due && (
                        <span
                          className={`text-[10px] ${
                            overdue ? "font-medium text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {format(due, "d MMM")}
                        </span>
                      )}
                    </div>

                    {task.assigneeIds[0] && (
                      <p className="truncate text-xs text-muted-foreground">
                        {people[task.assigneeIds[0]] ?? "Someone"}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {column.length === 0 && (
              <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                Nothing here
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

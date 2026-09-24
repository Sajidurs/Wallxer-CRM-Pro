import { format, isPast } from "date-fns";
import { CheckSquare, Plus } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { TaskListItem } from "../queries";
import {
  TASK_STATUS_LABELS,
  type TaskStatus,
} from "../schema";

interface EntityTaskListProps {
  tasks: TaskListItem[];
  people: Record<string, string>;
  newTaskHref: string;
  emptyDescription: string;
}

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  urgent: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};

/**
 * The compact task list used on a project's or a contact's Tasks tab.
 *
 * Deliberately not the full `TaskList` table: inside a tab there is no room for
 * six columns, and the project or contact column would repeat the page you are
 * already on.
 */
export function EntityTaskList({
  tasks,
  people,
  newTaskHref,
  emptyDescription,
}: EntityTaskListProps) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={CheckSquare}
        title="No tasks yet"
        description={emptyDescription}
        action={
          <Button asChild>
            <Link href={newTaskHref}>
              <Plus />
              New task
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button asChild size="sm">
          <Link href={newTaskHref}>
            <Plus />
            New task
          </Link>
        </Button>
      </div>

      <ul className="divide-y rounded-lg border">
        {tasks.map((task) => {
          const due = task.due_at ? new Date(task.due_at) : null;
          const overdue = due && isPast(due) && task.status !== "done";
          const assignee = task.assigneeIds[0] ? people[task.assigneeIds[0]] : null;

          return (
            <li key={task.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/tasks/${task.id}`}
                  className={`font-medium hover:underline ${
                    task.status === "done" ? "text-muted-foreground line-through" : ""
                  }`}
                >
                  {task.title}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {assignee ?? "Unassigned"}
                  {due && (
                    <span className={overdue ? "text-destructive" : undefined}>
                      {" · "}
                      {format(due, "d MMM")}
                      {overdue && " · overdue"}
                    </span>
                  )}
                </div>
              </div>

              <Badge variant={PRIORITY_VARIANT[task.priority] ?? "outline"}>
                {task.priority}
              </Badge>
              <Badge variant="outline">
                {TASK_STATUS_LABELS[task.status as TaskStatus] ?? task.status}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

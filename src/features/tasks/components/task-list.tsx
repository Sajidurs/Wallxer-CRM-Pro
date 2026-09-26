import { format, isPast, isToday } from "date-fns";
import { CheckSquare, Paperclip } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { TaskListItem } from "../queries";
import { TaskActions } from "./task-actions";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskPriority,
  type TaskStatus,
} from "../schema";

interface TaskListProps {
  tasks: TaskListItem[];
  people: Record<string, string>;
  projects: Record<string, string>;
  linkCounts: Record<string, number>;
  /** Editing depends on assignment, so it is decided per row. */
  canEdit: boolean;
  canDelete: boolean;
}

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  urgent: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  todo: "outline",
  in_progress: "default",
  review: "secondary",
  blocked: "secondary",
  done: "secondary",
};

export function dueLabel(task: TaskListItem) {
  if (!task.due_at) return null;

  const due = new Date(task.due_at);
  // A finished task is never late, however long it took.
  const overdue = isPast(due) && task.status !== "done";

  return {
    text: isToday(due) ? `Today, ${format(due, "HH:mm")}` : format(due, "d MMM, HH:mm"),
    overdue,
  };
}

export function TaskList({
  tasks,
  people,
  projects,
  linkCounts,
  canEdit,
  canDelete,
}: TaskListProps) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Task</TableHead>
            <TableHead className="hidden md:table-cell">Project</TableHead>
            <TableHead className="hidden lg:table-cell">Assignee</TableHead>
            <TableHead className="hidden sm:table-cell">Due</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead className="hidden sm:table-cell">Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            const due = dueLabel(task);
            const assignee = task.assigneeIds[0]
              ? people[task.assigneeIds[0]]
              : null;
            const links = linkCounts[task.id] ?? 0;

            return (
              <TableRow key={task.id}>
                <TableCell>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      <CheckSquare className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/tasks/${task.id}`}
                        className={`font-medium hover:underline ${
                          task.status === "done"
                            ? "text-muted-foreground line-through"
                            : ""
                        }`}
                      >
                        {task.title}
                      </Link>
                      {links > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Paperclip className="size-3" />
                          {links}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>

                <TableCell className="hidden md:table-cell">
                  {task.project_id ? (
                    <Link
                      href={`/projects/${task.project_id}`}
                      className="text-sm hover:underline"
                    >
                      {projects[task.project_id] ?? "Project"}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </TableCell>

                <TableCell className="hidden text-sm lg:table-cell">
                  {assignee ?? <span className="text-muted-foreground">Unassigned</span>}
                </TableCell>

                <TableCell className="hidden sm:table-cell">
                  {due ? (
                    <span
                      className={
                        due.overdue ? "text-sm font-medium text-destructive" : "text-sm"
                      }
                    >
                      {due.text}
                      {due.overdue && " · overdue"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </TableCell>

                <TableCell>
                  <Badge variant={PRIORITY_VARIANT[task.priority] ?? "outline"}>
                    {TASK_PRIORITY_LABELS[task.priority as TaskPriority] ?? task.priority}
                  </Badge>
                </TableCell>

                <TableCell className="hidden sm:table-cell">
                  <Badge variant={STATUS_VARIANT[task.status] ?? "outline"}>
                    {TASK_STATUS_LABELS[task.status as TaskStatus] ?? task.status}
                  </Badge>
                </TableCell>

                <TableCell>
                  <TaskActions
                    taskId={task.id}
                    title={task.title}
                    canEdit={canEdit}
                    canDelete={canDelete}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

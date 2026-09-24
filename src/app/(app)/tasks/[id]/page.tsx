import { format, formatDistanceToNow, isPast } from "date-fns";
import {
  Building2,
  CalendarDays,
  ExternalLink,
  FolderKanban,
  Timer,
  UserRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getContact } from "@/features/contacts/queries";
import { displayName } from "@/features/contacts/schema";
import { getProject } from "@/features/projects/queries";
import { listResourceLinks } from "@/features/shared/resource-links/queries";
import { LINK_KIND_LABELS, type LinkKind } from "@/features/shared/resource-links/schema";
import { TaskActions } from "@/features/tasks/components/task-actions";
import { getTask } from "@/features/tasks/queries";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskPriority,
  type TaskStatus,
} from "@/features/tasks/schema";
import { listAssignableUsers } from "@/features/users/queries";
import { requireUser } from "@/lib/auth";
import { atLeast, canEditTask } from "@/lib/permissions";

export async function generateMetadata(
  props: PageProps<"/tasks/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const task = await getTask(id);
  return { title: task ? task.title : "Task" };
}

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  urgent: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};

export default async function TaskDetailPage(props: PageProps<"/tasks/[id]">) {
  const actor = await requireUser();
  const { id } = await props.params;

  const task = await getTask(id);
  if (!task) notFound();

  const [people, links, project, contact] = await Promise.all([
    listAssignableUsers(),
    listResourceLinks("task", task.id),
    task.project_id ? getProject(task.project_id) : Promise.resolve(null),
    task.contact_id ? getContact(task.contact_id) : Promise.resolve(null),
  ]);

  const peopleById = new Map(people.map((p) => [p.id, p.name]));
  const assignee = task.assigneeIds[0] ? peopleById.get(task.assigneeIds[0]) : null;

  const due = task.due_at ? new Date(task.due_at) : null;
  const overdue = due && isPast(due) && task.status !== "done";

  const mayEdit = canEditTask(actor, { assigneeIds: task.assigneeIds });

  return (
    <>
      <PageHeader
        title={task.title}
        description={`Created ${formatDistanceToNow(new Date(task.created_at))} ago`}
        actions={
          <TaskActions
            taskId={task.id}
            title={task.title}
            canEdit={mayEdit}
            canDelete={atLeast(actor.role, "manager")}
            redirectTo="/tasks"
            variant="buttons"
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">
          {TASK_STATUS_LABELS[task.status as TaskStatus] ?? task.status}
        </Badge>
        <Badge variant={PRIORITY_VARIANT[task.priority] ?? "outline"}>
          {TASK_PRIORITY_LABELS[task.priority as TaskPriority] ?? task.priority}
        </Badge>
        {overdue && <Badge variant="destructive">Overdue</Badge>}
        {task.completed_at && (
          <span className="text-xs text-muted-foreground">
            Completed {formatDistanceToNow(new Date(task.completed_at))} ago
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              {task.description ? (
                <p className="whitespace-pre-wrap text-sm">{task.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No description.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Links ({links.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {links.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No links yet. Edit the task to add a walkthrough or a spec.
                </p>
              ) : (
                <ul className="divide-y">
                  {links.map((link) => (
                    <li key={link.id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{link.name}</span>
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                            {LINK_KIND_LABELS[link.kind as LinkKind] ?? link.kind}
                          </Badge>
                        </div>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-xs text-muted-foreground hover:underline"
                        >
                          {link.url}
                        </a>
                      </div>
                      <Button variant="ghost" size="icon" asChild>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${link.name}`}
                        >
                          <ExternalLink />
                        </a>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Assignee</div>
                {assignee ?? <span className="text-muted-foreground">Unassigned</span>}
              </div>
            </div>

            <div className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Due</div>
                {due ? (
                  <span className={overdue ? "text-destructive" : undefined}>
                    {format(due, "d MMM yyyy, HH:mm")}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No due date</span>
                )}
              </div>
            </div>

            {task.estimated_minutes && (
              <div className="flex items-start gap-2">
                <Timer className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Estimate</div>
                  {task.estimated_minutes} minutes
                </div>
              </div>
            )}

            {project && (
              <div className="flex items-start gap-2">
                <FolderKanban className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Project</div>
                  <Link href={`/projects/${project.id}`} className="hover:underline">
                    {project.name}
                  </Link>
                </div>
              </div>
            )}

            {contact && (
              <div className="flex items-start gap-2">
                <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Contact</div>
                  <Link href={`/contacts/${contact.id}`} className="hover:underline">
                    {displayName(contact)}
                  </Link>
                </div>
              </div>
            )}

            {!mayEdit && (
              <p className="border-t pt-3 text-xs text-muted-foreground">
                This task is not assigned to you, so it is read only.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

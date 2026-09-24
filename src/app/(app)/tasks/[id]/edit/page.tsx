import { format } from "date-fns";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { listContactOptions } from "@/features/contacts/queries";
import { listProjectOptions } from "@/features/projects/queries";
import { listResourceLinks } from "@/features/shared/resource-links/queries";
import type { LinkKind } from "@/features/shared/resource-links/schema";
import { TaskForm } from "@/features/tasks/components/task-form";
import { getTask } from "@/features/tasks/queries";
import type { TaskPriority, TaskStatus } from "@/features/tasks/schema";
import { listAssignableUsers } from "@/features/users/queries";
import { requireUser } from "@/lib/auth";
import { atLeast, canEditTask } from "@/lib/permissions";

export const metadata: Metadata = { title: "Edit task" };

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in local time, not an ISO string. */
function toLocalInput(value: string | null) {
  if (!value) return "";
  return format(new Date(value), "yyyy-MM-dd'T'HH:mm");
}

export default async function EditTaskPage(props: PageProps<"/tasks/[id]/edit">) {
  const actor = await requireUser();
  const { id } = await props.params;

  const task = await getTask(id);
  if (!task) notFound();

  // The database enforces this too; redirecting is the courtesy of not showing
  // someone a form that cannot be submitted.
  if (!canEditTask(actor, { assigneeIds: task.assigneeIds })) {
    redirect(`/tasks/${id}`);
  }

  const [projects, contacts, people, links] = await Promise.all([
    listProjectOptions(),
    listContactOptions(),
    listAssignableUsers(),
    listResourceLinks("task", task.id),
  ]);

  return (
    <>
      <PageHeader
        title={`Edit ${task.title}`}
        description="Changes are visible to the whole team immediately."
      />

      <div className="max-w-3xl">
        <TaskForm
          taskId={task.id}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          contacts={contacts}
          assignees={people}
          canReassign={atLeast(actor.role, "manager")}
          defaults={{
            title: task.title,
            description: task.description ?? "",
            status: task.status as TaskStatus,
            priority: task.priority as TaskPriority,
            projectId: task.project_id,
            contactId: task.contact_id,
            assigneeId: task.assigneeIds[0] ?? null,
            startAt: toLocalInput(task.start_at),
            dueAt: toLocalInput(task.due_at),
            estimatedMinutes: task.estimated_minutes ?? "",
            links: links.map((link) => ({
              kind: link.kind as LinkKind,
              name: link.name,
              url: link.url,
            })),
          }}
        />
      </div>
    </>
  );
}

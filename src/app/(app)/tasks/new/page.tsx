import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { listContactOptions } from "@/features/contacts/queries";
import { listProjectOptions } from "@/features/projects/queries";
import { TaskForm } from "@/features/tasks/components/task-form";
import { listAssignableUsers } from "@/features/users/queries";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "New task" };

export default async function NewTaskPage(props: PageProps<"/tasks/new">) {
  const actor = await requireUser();
  const searchParams = await props.searchParams;

  const [projects, contacts, people] = await Promise.all([
    listProjectOptions(),
    listContactOptions(),
    listAssignableUsers(),
  ]);

  // Arriving from a project or contact tab pre-selects it.
  const projectId =
    typeof searchParams.projectId === "string" ? searchParams.projectId : null;
  const contactId =
    typeof searchParams.contactId === "string" ? searchParams.contactId : null;

  return (
    <>
      <PageHeader
        title="New task"
        description="Assign it, date it, and attach whatever the work needs."
      />

      <div className="max-w-3xl">
        <TaskForm
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          contacts={contacts}
          assignees={people}
          // Anyone may set the assignee on a task they are creating; the policy
          // allows it because they are the creator.
          canReassign
          defaults={{
            title: "",
            description: "",
            status: "todo",
            priority: "medium",
            projectId: projects.some((p) => p.id === projectId) ? projectId : null,
            contactId: contacts.some((c) => c.id === contactId) ? contactId : null,
            assigneeId: actor.id,
            startAt: "",
            dueAt: "",
            estimatedMinutes: "",
            links: [],
          }}
        />
      </div>
    </>
  );
}

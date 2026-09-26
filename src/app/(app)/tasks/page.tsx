import { CheckSquare, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/common/empty-state";
import type { PersonInfo } from "@/components/common/person";
import { Pagination } from "@/components/common/pagination";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listProjectOptions } from "@/features/projects/queries";
import { listResourceLinksFor } from "@/features/shared/resource-links/queries";
import { TaskBoard } from "@/features/tasks/components/task-board";
import { TaskFilters } from "@/features/tasks/components/task-filters";
import { TaskList } from "@/features/tasks/components/task-list";
import { listBoardTasks, listTasks } from "@/features/tasks/queries";
import { taskFiltersSchema } from "@/features/tasks/schema";
import { signAvatars } from "@/features/users/avatars";
import { listAssignableUsers } from "@/features/users/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage(props: PageProps<"/tasks">) {
  const actor = await requireUser();
  const searchParams = await props.searchParams;

  const parsed = taskFiltersSchema.safeParse(searchParams);
  const filters = parsed.success ? parsed.data : taskFiltersSchema.parse({});

  const [people, projects] = await Promise.all([
    listAssignableUsers(),
    listProjectOptions(),
  ]);

  const isBoard = filters.view === "board";

  // The board needs every card at once to group them into columns; the list
  // pages. Fetching only the one being shown keeps a board view from paying
  // for pagination it does not use, and vice versa.
  const [listResult, boardTasks] = await Promise.all([
    isBoard ? null : listTasks(filters),
    isBoard ? listBoardTasks(filters) : null,
  ]);

  const tasks = boardTasks ?? listResult?.tasks ?? [];

  const links = await listResourceLinksFor(
    "task",
    tasks.map((task) => task.id),
  );

  // One batch of signed URLs for every face on the page, rather than one
  // Storage round trip per card.
  const avatars = await signAvatars(people.map((p) => p.avatarPath));

  const peopleById: Record<string, PersonInfo> = Object.fromEntries(
    people.map((p) => [
      p.id,
      { name: p.name, avatarUrl: p.avatarPath ? (avatars.get(p.avatarPath) ?? null) : null },
    ]),
  );
  const projectsById = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const linkCounts = Object.fromEntries(
    [...links.entries()].map(([taskId, list]) => [taskId, list.length]),
  );

  const hasFilters = Boolean(
    filters.q ||
      filters.status ||
      filters.priority ||
      filters.assigneeId ||
      filters.projectId ||
      filters.due,
  );

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Everything the team is working on, across every project."
        actions={
          <Button asChild>
            <Link href="/tasks/new">
              <Plus />
              New task
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<Skeleton className="h-28 w-full" />}>
        <TaskFilters
          people={people}
          projects={projects}
          currentUserId={actor.id}
        />
      </Suspense>

      {/* The board renders even with nothing in it. Its columns are the
          workflow, and hiding them behind an empty state makes the shape of
          the process invisible and leaves nowhere to drop the first card. The
          list has no such structure to show, so it keeps the empty state. */}
      {isBoard ? (
        <TaskBoard
          tasks={tasks}
          people={peopleById}
          canEdit={can(actor, "update", "task")}
          canDelete={can(actor, "delete", "task")}
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title={hasFilters ? "No tasks match those filters" : "No tasks yet"}
          description={
            hasFilters
              ? "Try clearing a filter, or widening the due window."
              : "Tasks can stand alone or belong to a project, and carry links to whatever the work needs."
          }
          action={
            !hasFilters && (
              <Button asChild>
                <Link href="/tasks/new">
                  <Plus />
                  New task
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          <TaskList
            tasks={tasks}
            people={peopleById}
            projects={projectsById}
            linkCounts={linkCounts}
            canEdit={can(actor, "update", "task")}
            canDelete={can(actor, "delete", "task")}
          />
          {listResult && (
            <Suspense fallback={null}>
              <Pagination
                page={listResult.page}
                pageCount={listResult.pageCount}
                total={listResult.total}
                label="tasks"
              />
            </Suspense>
          )}
        </div>
      )}
    </>
  );
}

import { FolderKanban, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listBrandOptions } from "@/features/brands/queries";
import { listContactOptions } from "@/features/contacts/queries";
import { ProjectFilters } from "@/features/projects/components/project-filters";
import { ProjectsTable } from "@/features/projects/components/projects-table";
import { listProjects } from "@/features/projects/queries";
import { projectFiltersSchema } from "@/features/projects/schema";
import { listAssignableUsers } from "@/features/users/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage(props: PageProps<"/projects">) {
  const actor = await requireUser();
  const searchParams = await props.searchParams;

  const parsed = projectFiltersSchema.safeParse(searchParams);
  const filters = parsed.success ? parsed.data : projectFiltersSchema.parse({});

  const [result, brands, owners, clients] = await Promise.all([
    listProjects(filters),
    listBrandOptions(),
    listAssignableUsers(),
    listContactOptions(),
  ]);

  const hasFilters = Boolean(
    filters.q || filters.status || filters.brandId || filters.ownerId || filters.contactId,
  );

  const canCreate = can(actor, "create", "project");

  return (
    <>
      <PageHeader
        title="Projects"
        description="Client work, with its websites, credentials, and files."
        actions={
          canCreate && (
            <Button asChild>
              <Link href="/projects/new">
                <Plus />
                New project
              </Link>
            </Button>
          )
        }
      />

      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <ProjectFilters brands={brands} owners={owners} clients={clients} />
      </Suspense>

      {result.projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={hasFilters ? "No projects match those filters" : "No projects yet"}
          description={
            hasFilters
              ? "Try clearing a filter, or searching for something less specific."
              : "A project holds the websites, logins, and files for one piece of client work."
          }
          action={
            !hasFilters &&
            canCreate && (
              <Button asChild>
                <Link href="/projects/new">
                  <Plus />
                  New project
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          <ProjectsTable
            projects={result.projects}
            brands={brands}
            owners={owners}
            clients={clients}
          />
          <Suspense fallback={null}>
            <Pagination
              page={result.page}
              pageCount={result.pageCount}
              total={result.total}
              label="projects"
            />
          </Suspense>
        </div>
      )}
    </>
  );
}

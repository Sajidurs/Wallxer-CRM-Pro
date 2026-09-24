import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { listBrandOptions } from "@/features/brands/queries";
import { listContactOptions } from "@/features/contacts/queries";
import { ProjectForm } from "@/features/projects/components/project-form";
import { getProject } from "@/features/projects/queries";
import { listAssignableUsers } from "@/features/users/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Edit project" };

export default async function EditProjectPage(
  props: PageProps<"/projects/[id]/edit">,
) {
  const actor = await requireUser();
  const { id } = await props.params;

  if (!can(actor, "update", "project")) {
    redirect(`/projects/${id}`);
  }

  const [project, brands, owners, clients] = await Promise.all([
    getProject(id),
    listBrandOptions(),
    listAssignableUsers(),
    listContactOptions(),
  ]);

  if (!project) notFound();

  return (
    <>
      <PageHeader
        title={`Edit ${project.name}`}
        description="Changes are visible to the whole team immediately."
      />

      <div className="max-w-3xl">
        <ProjectForm
          projectId={project.id}
          brands={brands}
          owners={owners}
          clients={clients}
          defaults={{
            name: project.name,
            code: project.code ?? "",
            description: project.description ?? "",
            status: project.status,
            contactId: project.contact_id,
            brandId: project.brand_id,
            ownerId: project.owner_id,
            startDate: project.start_date ?? "",
            dueDate: project.due_date ?? "",
          }}
        />
      </div>
    </>
  );
}

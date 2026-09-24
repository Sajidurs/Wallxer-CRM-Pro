import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { listBrandOptions } from "@/features/brands/queries";
import { listContactOptions } from "@/features/contacts/queries";
import { ProjectForm } from "@/features/projects/components/project-form";
import { listAssignableUsers } from "@/features/users/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage(props: PageProps<"/projects/new">) {
  const actor = await requireUser();

  if (!can(actor, "create", "project")) {
    redirect("/projects");
  }

  const searchParams = await props.searchParams;
  // Arriving from a contact's Projects tab pre-selects that client.
  const contactId =
    typeof searchParams.contactId === "string" ? searchParams.contactId : null;

  const [brands, owners, clients] = await Promise.all([
    listBrandOptions(),
    listAssignableUsers(),
    listContactOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="New project"
        description="One piece of client work, with its own websites, credentials, and files."
      />

      <div className="max-w-3xl">
        <ProjectForm
          brands={brands}
          owners={owners}
          clients={clients}
          defaults={{
            name: "",
            code: "",
            description: "",
            status: "planning",
            contactId: clients.some((c) => c.id === contactId) ? contactId : null,
            brandId: null,
            ownerId: actor.id,
            startDate: "",
            dueDate: "",
          }}
        />
      </div>
    </>
  );
}

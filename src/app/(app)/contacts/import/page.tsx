import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { listBrandOptions } from "@/features/brands/queries";
import { ImportWizard } from "@/features/contacts/import/components/import-wizard";
import { listAssignableUsers } from "@/features/users/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Import contacts" };

export default async function ImportContactsPage() {
  const actor = await requireUser();

  if (!can(actor, "create", "contact")) {
    redirect("/contacts");
  }

  const [owners, brands] = await Promise.all([
    listAssignableUsers(),
    listBrandOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Import contacts"
        description="From a CSV. Existing contacts are matched by email, so importing the same list twice does not duplicate anyone."
      />

      <div className="max-w-5xl">
        <ImportWizard
          owners={owners}
          brands={brands}
          currentUserId={actor.id}
        />
      </div>
    </>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { listIssuerOptions } from "@/features/brands/queries";
import { listContactOptions } from "@/features/contacts/queries";
import { RenewalForm } from "@/features/renewals/components/renewal-form";
import { listProjectOptions } from "@/features/projects/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Add a renewal" };

export default async function NewRenewalPage() {
  const actor = await requireUser();
  if (!can(actor, "update", "project")) redirect("/renewals");

  const [clients, projects, companies] = await Promise.all([
    listContactOptions(),
    listProjectOptions(),
    listIssuerOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Add a renewal"
        description="Anything that comes round again — hosting, a domain, a tool licence."
      />

      <Card className="max-w-4xl">
        <CardContent>
          <RenewalForm clients={clients} projects={projects} companies={companies} />
        </CardContent>
      </Card>
    </>
  );
}

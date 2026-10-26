import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { listIssuerOptions } from "@/features/brands/queries";
import { listContactOptions } from "@/features/contacts/queries";
import { ProposalForm } from "@/features/proposals/components/proposal-form";
import { listProjectOptions } from "@/features/projects/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "New proposal" };

export default async function NewProposalPage(props: PageProps<"/proposals/new">) {
  const actor = await requireUser();
  if (!can(actor, "create", "project")) notFound();

  // Linked from a contact or a project, so the obvious one is already chosen.
  const searchParams = await props.searchParams;
  const contactId = typeof searchParams.contact === "string" ? searchParams.contact : undefined;
  const projectId = typeof searchParams.project === "string" ? searchParams.project : undefined;

  const [companies, clients, projects] = await Promise.all([
    listIssuerOptions(),
    listContactOptions(),
    listProjectOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="New proposal"
        description="The company you choose supplies the letterhead and the number."
      />

      {companies.length === 0 && (
        <Alert>
          <AlertTriangle />
          <AlertDescription>
            There are no active companies to propose from.{" "}
            <Link href="/settings/brands" className="underline underline-offset-2">
              Add one in Settings
            </Link>{" "}
            first.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <ProposalForm
            companies={companies}
            clients={clients}
            projects={projects}
            defaultValues={{
              ...(contactId ? { contactId } : {}),
              ...(projectId ? { projectId } : {}),
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}

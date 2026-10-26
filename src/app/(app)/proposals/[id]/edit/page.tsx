import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { listIssuerOptions } from "@/features/brands/queries";
import { listContactOptions } from "@/features/contacts/queries";
import { ProposalForm } from "@/features/proposals/components/proposal-form";
import { getProposal, listProposalItems } from "@/features/proposals/queries";
import type { ProposalStatus } from "@/features/proposals/schema";
import { listProjectOptions } from "@/features/projects/queries";
import { requireUser } from "@/lib/auth";
import { minorToInput, type Currency } from "@/lib/money";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Edit proposal" };

export default async function EditProposalPage(
  props: PageProps<"/proposals/[id]/edit">,
) {
  const actor = await requireUser();
  if (!can(actor, "update", "project")) notFound();

  const { id } = await props.params;
  const proposal = await getProposal(id);
  if (!proposal) notFound();

  // The action refuses this too; catching it here means the form is never
  // rendered for a proposal that cannot accept it.
  if ((proposal.status as ProposalStatus) !== "draft") {
    redirect(`/proposals/${proposal.id}`);
  }

  const [items, companies, clients, projects] = await Promise.all([
    listProposalItems(proposal.id),
    listIssuerOptions(),
    listContactOptions(),
    listProjectOptions(),
  ]);

  return (
    <>
      <PageHeader title={`Edit ${proposal.number}`} />

      <Card>
        <CardContent>
          <ProposalForm
            companies={companies}
            clients={clients}
            projects={projects}
            proposalId={proposal.id}
            defaultValues={{
              brandId: proposal.brand_id,
              contactId: proposal.contact_id ?? "",
              projectId: proposal.project_id,
              title: proposal.title,
              currency: proposal.currency as Currency,
              issueDate: proposal.issue_date,
              validUntil: proposal.valid_until,
              overview: proposal.overview,
              scope: proposal.scope,
              deliverables: proposal.deliverables,
              timeline: proposal.timeline,
              investment: proposal.investment,
              terms: proposal.terms,
              taxRate: String(Number(proposal.tax_rate)),
              taxLabel: proposal.tax_label,
              items: items.map((item) => ({
                description: item.description,
                quantity: String(Number(item.quantity)),
                unitAmount: minorToInput(Number(item.unit_amount_minor)),
              })),
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}

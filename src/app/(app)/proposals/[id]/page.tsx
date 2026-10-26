import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Pill, type PillTone } from "@/components/common/pill";
import { signLogo } from "@/features/brands/logos";
import { getBrand } from "@/features/brands/queries";
import { getContact } from "@/features/contacts/queries";
import { displayName } from "@/features/contacts/schema";
import { ProposalActions } from "@/features/proposals/components/proposal-actions";
import { ProposalDocument } from "@/features/proposals/components/proposal-document";
import { getProposal, listProposalItems } from "@/features/proposals/queries";
import {
  PROPOSAL_STATUS_LABELS,
  type ClientSnapshot,
  type IssuerSnapshot,
  type ProposalStatus,
} from "@/features/proposals/schema";
import { getProject } from "@/features/projects/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Proposal" };

const STATUS_TONE: Record<ProposalStatus, PillTone> = {
  draft: "grey",
  sent: "blue",
  accepted: "green",
  declined: "red",
};

export default async function ProposalPage(props: PageProps<"/proposals/[id]">) {
  const actor = await requireUser();

  const { id } = await props.params;
  const proposal = await getProposal(id);
  if (!proposal) notFound();

  const [items, brand, contact, project] = await Promise.all([
    listProposalItems(proposal.id),
    getBrand(proposal.brand_id),
    proposal.contact_id ? getContact(proposal.contact_id) : Promise.resolve(null),
    proposal.project_id ? getProject(proposal.project_id) : Promise.resolve(null),
  ]);

  // A draft reflects the company as it is now; anything further along shows the
  // letterhead frozen onto it when it was sent, because that is the document
  // the client is holding.
  const frozen = proposal.issuer_snapshot as IssuerSnapshot | null;

  const issuer: IssuerSnapshot = frozen ?? {
    name: brand?.name ?? "Unknown company",
    legalName: brand?.legal_name ?? null,
    email: brand?.email ?? null,
    phone: brand?.phone ?? null,
    website: brand?.website ?? null,
    address: brand?.address ?? null,
    bankDetails: brand?.bank_details ?? null,
    taxId: brand?.tax_id ?? null,
    logoPath: brand?.logo_path ?? null,
  };

  const frozenClient = proposal.client_snapshot as ClientSnapshot | null;

  const client: ClientSnapshot | null =
    frozenClient ??
    (contact
      ? {
          name: displayName(contact),
          email: contact.email,
          phone: contact.phone,
          address: null,
        }
      : null);

  const logoUrl = await signLogo(issuer.logoPath);

  return (
    <>
      {/* Page chrome, dropped when printing so only the document reaches paper. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{proposal.title}</h1>
          <span className="font-mono text-sm text-muted-foreground">
            {proposal.number}
          </span>
          <Pill tone={STATUS_TONE[proposal.status as ProposalStatus]} dot>
            {PROPOSAL_STATUS_LABELS[proposal.status as ProposalStatus]}
          </Pill>
          {proposal.status === "draft" && (
            <span className="text-xs text-muted-foreground">
              Company details are still live and will freeze when you mark it sent
            </span>
          )}
        </div>

        <ProposalActions
          proposalId={proposal.id}
          number={proposal.number}
          title={proposal.title}
          status={proposal.status as ProposalStatus}
          clientEmail={client?.email ?? null}
          issuerName={issuer.name}
          canDelete={can(actor, "delete", "project")}
        />
      </div>

      <div className="rounded-lg border border-border bg-white print:rounded-none print:border-0">
        <ProposalDocument
          proposal={proposal}
          items={items}
          issuer={issuer}
          client={client}
          logoUrl={logoUrl}
          projectName={project?.name ?? null}
        />
      </div>
    </>
  );
}

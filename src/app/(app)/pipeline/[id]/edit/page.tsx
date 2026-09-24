import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { listBrandOptions } from "@/features/brands/queries";
import { listContactOptions } from "@/features/contacts/queries";
import { DealForm } from "@/features/pipeline/components/deal-form";
import {
  getDeal,
  getWorkspaceSettings,
  listPipelines,
  listStages,
} from "@/features/pipeline/queries";
import { showValues } from "@/features/pipeline/schema";
import { listAssignableUsers } from "@/features/users/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Edit deal" };

export default async function EditDealPage(props: PageProps<"/pipeline/[id]/edit">) {
  const actor = await requireUser();
  const { id } = await props.params;

  if (!can(actor, "update", "deal")) {
    redirect(`/pipeline/${id}`);
  }

  const [deal, pipelines, contacts, brands, owners, settings] = await Promise.all([
    getDeal(id),
    listPipelines(),
    listContactOptions(),
    listBrandOptions(),
    listAssignableUsers(),
    getWorkspaceSettings(),
  ]);

  if (!deal) notFound();

  // Archived stages are included here so a deal sitting in one still shows its
  // real stage rather than silently jumping to another.
  const stages = await listStages(deal.pipeline_id, true);

  return (
    <>
      <PageHeader
        title={`Edit ${deal.title}`}
        description="Moving it to a won or lost stage closes the deal."
      />

      <div className="max-w-3xl">
        <DealForm
          dealId={deal.id}
          contacts={contacts}
          brands={brands}
          owners={owners}
          pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))}
          stages={stages}
          showValues={showValues(settings)}
          defaults={{
            title: deal.title,
            description: deal.description ?? "",
            contactId: deal.contact_id ?? "",
            pipelineId: deal.pipeline_id,
            stageId: deal.stage_id,
            brandId: deal.brand_id,
            ownerId: deal.owner_id,
            expectedCloseDate: deal.expected_close_date ?? "",
            amount: deal.amount ?? "",
            currency: deal.currency ?? "USD",
          }}
        />
      </div>
    </>
  );
}

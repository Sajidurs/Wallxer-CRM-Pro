import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { listBrandOptions } from "@/features/brands/queries";
import { listContactOptions } from "@/features/contacts/queries";
import { DealForm } from "@/features/pipeline/components/deal-form";
import {
  getWorkspaceSettings,
  listPipelines,
  listStages,
} from "@/features/pipeline/queries";
import { showValues } from "@/features/pipeline/schema";
import { listAssignableUsers } from "@/features/users/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "New deal" };

export default async function NewDealPage(props: PageProps<"/pipeline/new">) {
  const actor = await requireUser();

  if (!can(actor, "create", "deal")) {
    redirect("/pipeline");
  }

  const searchParams = await props.searchParams;

  const [pipelines, contacts, brands, owners, settings] = await Promise.all([
    listPipelines(),
    listContactOptions(),
    listBrandOptions(),
    listAssignableUsers(),
    getWorkspaceSettings(),
  ]);

  if (pipelines.length === 0) redirect("/pipeline");

  const requested =
    typeof searchParams.pipelineId === "string" ? searchParams.pipelineId : null;
  const pipeline =
    pipelines.find((p) => p.id === requested) ??
    pipelines.find((p) => p.is_default) ??
    pipelines[0];

  const stages = await listStages(pipeline.id);

  if (stages.length === 0) redirect("/pipeline");

  // A new deal starts at the beginning, not in Won.
  const firstStage = stages[0];

  const contactId =
    typeof searchParams.contactId === "string" ? searchParams.contactId : null;

  return (
    <>
      <PageHeader
        title="New deal"
        description={`It will enter ${pipeline.name} at ${firstStage.name}.`}
      />

      <div className="max-w-3xl">
        <DealForm
          contacts={contacts}
          brands={brands}
          owners={owners}
          pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))}
          stages={stages}
          showValues={showValues(settings)}
          defaults={{
            title: "",
            description: "",
            contactId: contacts.some((c) => c.id === contactId)
              ? (contactId as string)
              : "",
            pipelineId: pipeline.id,
            stageId: firstStage.id,
            brandId: pipeline.brand_id,
            ownerId: actor.id,
            expectedCloseDate: "",
            amount: "",
            currency: "USD",
          }}
        />
      </div>
    </>
  );
}

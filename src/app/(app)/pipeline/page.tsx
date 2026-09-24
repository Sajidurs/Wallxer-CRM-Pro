import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { listContactOptions } from "@/features/contacts/queries";
import { PipelineBoard } from "@/features/pipeline/components/pipeline-board";
import { PipelinePicker } from "@/features/pipeline/components/pipeline-picker";
import {
  getWorkspaceSettings,
  listDeals,
  listPipelines,
  listStages,
} from "@/features/pipeline/queries";
import { dealFiltersSchema, showValues } from "@/features/pipeline/schema";
import { listAssignableUsers } from "@/features/users/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage(props: PageProps<"/pipeline">) {
  const actor = await requireUser();
  const searchParams = await props.searchParams;

  const parsed = dealFiltersSchema.safeParse(searchParams);
  const filters = parsed.success ? parsed.data : dealFiltersSchema.parse({});

  const [pipelines, contacts, owners, settings] = await Promise.all([
    listPipelines(),
    listContactOptions(),
    listAssignableUsers(),
    getWorkspaceSettings(),
  ]);

  if (pipelines.length === 0) {
    return (
      <>
        <PageHeader
          title="Pipeline"
          description="Deals on a board, with stages you control."
        />
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No pipeline exists yet. An admin can create one in Settings →
            Pipelines.
          </p>
        </div>
      </>
    );
  }

  // Default to the workspace default, so the board is useful without a choice
  // being made first.
  const active =
    pipelines.find((p) => p.id === filters.pipelineId) ??
    pipelines.find((p) => p.is_default) ??
    pipelines[0];

  const [stages, deals] = await Promise.all([
    listStages(active.id),
    listDeals({ ...filters, pipelineId: active.id }),
  ]);

  const contactsById = Object.fromEntries(contacts.map((c) => [c.id, c.name]));
  const ownersById = Object.fromEntries(owners.map((o) => [o.id, o.name]));

  const values = showValues(settings);

  // When the workspace does not track money, the amounts do not travel to the
  // browser at all. Not rendering them would have been enough to look right,
  // but they would still sit in the RSC payload for anyone who opened dev
  // tools. This is tidiness rather than access control — any workspace member
  // can read `deals.amount` through the API regardless, because RLS allows it.
  // If amounts ever need to be restricted, that is a policy, not a setting.
  const visibleDeals = values
    ? deals
    : deals.map((deal) => ({ ...deal, amount: null, currency: "" }));

  return (
    <>
      <PageHeader
        title="Pipeline"
        description={`${deals.length} open ${deals.length === 1 ? "deal" : "deals"} in ${active.name}.`}
        actions={
          can(actor, "create", "deal") && (
            <Button asChild>
              <Link href={`/pipeline/new?pipelineId=${active.id}`}>
                <Plus />
                New deal
              </Link>
            </Button>
          )
        }
      />

      {pipelines.length > 1 && (
        <PipelinePicker pipelines={pipelines} activeId={active.id} />
      )}

      <PipelineBoard
        stages={stages}
        deals={visibleDeals}
        contacts={contactsById}
        owners={ownersById}
        showValues={values}
        canMove={can(actor, "update", "deal")}
        newDealHref={`/pipeline/new?pipelineId=${active.id}`}
      />
    </>
  );
}

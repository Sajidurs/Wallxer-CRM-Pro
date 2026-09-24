import { format } from "date-fns";
import { KanbanSquare, Plus } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { Deal, PipelineStage } from "../queries";
import { DEAL_STATUS_LABELS, formatAmount, type DealStatus } from "../schema";

interface ContactDealListProps {
  deals: Deal[];
  stages: PipelineStage[];
  contactId: string;
  showValues: boolean;
  canCreate: boolean;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  open: "default",
  won: "secondary",
  lost: "destructive",
};

export function ContactDealList({
  deals,
  stages,
  contactId,
  showValues,
  canCreate,
}: ContactDealListProps) {
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const newDealHref = `/pipeline/new?contactId=${contactId}`;

  if (deals.length === 0) {
    return (
      <EmptyState
        icon={KanbanSquare}
        title="No deals with this contact yet"
        description="A deal tracks a sale through your pipeline, from first enquiry to won or lost."
        action={
          canCreate && (
            <Button asChild>
              <Link href={newDealHref}>
                <Plus />
                New deal
              </Link>
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {canCreate && (
        <div className="flex justify-end">
          <Button asChild size="sm">
            <Link href={newDealHref}>
              <Plus />
              New deal
            </Link>
          </Button>
        </div>
      )}

      <ul className="divide-y rounded-lg border">
        {deals.map((deal) => {
          const stage = stageById.get(deal.stage_id);

          return (
            <li key={deal.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/pipeline/${deal.id}`}
                  className="font-medium hover:underline"
                >
                  {deal.title}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {stage?.name ?? "Unknown stage"}
                  {deal.expected_close_date &&
                    ` · closes ${format(new Date(deal.expected_close_date), "d MMM yyyy")}`}
                </div>
              </div>

              {showValues && deal.amount !== null && (
                <Badge variant="secondary">
                  {formatAmount(deal.amount, deal.currency)}
                </Badge>
              )}

              <Badge variant={STATUS_VARIANT[deal.status] ?? "default"}>
                {DEAL_STATUS_LABELS[deal.status as DealStatus] ?? deal.status}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

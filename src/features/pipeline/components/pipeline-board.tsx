"use client";

import { format } from "date-fns";
import { GripVertical, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { moveDeal } from "../actions";
import type { Deal, PipelineStage } from "../queries";
import { formatAmount, midpoint } from "../schema";

interface PipelineBoardProps {
  stages: PipelineStage[];
  deals: Deal[];
  contacts: Record<string, string>;
  owners: Record<string, string>;
  /** Amount columns appear only when the workspace tracks values. */
  showValues: boolean;
  canMove: boolean;
  newDealHref: string;
}

export function PipelineBoard({
  stages,
  deals,
  contacts,
  owners,
  showValues,
  canMove,
  newDealHref,
}: PipelineBoardProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const [local, setLocal] = useState(deals);
  const [lastServer, setLastServer] = useState(deals);

  if (deals !== lastServer) {
    setLastServer(deals);
    setLocal(deals);
  }

  function drop(stageId: string) {
    setOverStage(null);
    const id = dragging;
    setDragging(null);
    if (!id || !canMove) return;

    const deal = local.find((d) => d.id === id);
    if (!deal || deal.stage_id === stageId) return;

    const column = local
      .filter((d) => d.stage_id === stageId && d.id !== id)
      .sort((a, b) => a.position - b.position);
    const position = midpoint(column.at(-1)?.position ?? null, null);

    setLocal((current) =>
      current.map((d) => (d.id === id ? { ...d, stage_id: stageId, position } : d)),
    );

    startTransition(async () => {
      const result = await moveDeal({ id, stageId, position });
      if (!result.ok) {
        toast.error(result.error);
        setLocal(lastServer);
        return;
      }
      // Refreshed so the outcome badge follows the stage: dropping into Won
      // marks the deal won, and that is decided by a trigger, not here.
      router.refresh();
    });
  }

  if (stages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">
          This pipeline has no stages yet. An admin can add them in Settings →
          Pipelines.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {stages.map((stage) => {
        const column = local
          .filter((deal) => deal.stage_id === stage.id)
          .sort((a, b) => a.position - b.position);

        const columnTotal = column.reduce((sum, deal) => sum + (deal.amount ?? 0), 0);

        return (
          <div
            key={stage.id}
            onDragOver={(event) => {
              event.preventDefault();
              setOverStage(stage.id);
            }}
            onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
            onDrop={() => drop(stage.id)}
            className={`flex min-h-40 w-72 shrink-0 flex-col gap-2 rounded-lg border p-2 transition-colors ${
              overStage === stage.id ? "border-primary bg-primary/5" : "bg-muted/30"
            }`}
          >
            <div className="flex items-center justify-between gap-2 px-1 py-0.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: stage.color }}
                  aria-hidden
                />
                <span className="truncate text-sm font-medium">{stage.name}</span>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {column.length}
              </span>
            </div>

            {showValues && columnTotal > 0 && (
              <div className="px-1 text-xs text-muted-foreground">
                {formatAmount(columnTotal, column[0]?.currency ?? "USD")}
              </div>
            )}

            {column.map((deal) => (
              <Card
                key={deal.id}
                draggable={canMove}
                onDragStart={() => setDragging(deal.id)}
                onDragEnd={() => setDragging(null)}
                className={`${canMove ? "cursor-grab active:cursor-grabbing" : ""} ${
                  dragging === deal.id ? "opacity-50" : ""
                }`}
              >
                <CardContent className="space-y-1.5 p-3">
                  <div className="flex items-start gap-1.5">
                    {canMove && (
                      <GripVertical className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <Link
                      href={`/pipeline/${deal.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {deal.title}
                    </Link>
                  </div>

                  {deal.contact_id && (
                    <p className="truncate text-xs text-muted-foreground">
                      {contacts[deal.contact_id] ?? "Contact"}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5">
                    {showValues && deal.amount !== null && (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                        {formatAmount(deal.amount, deal.currency)}
                      </Badge>
                    )}
                    {deal.expected_close_date && (
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(deal.expected_close_date), "d MMM")}
                      </span>
                    )}
                  </div>

                  {deal.owner_id && (
                    <p className="truncate text-xs text-muted-foreground">
                      {owners[deal.owner_id] ?? "Someone"}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}

            {column.length === 0 && (
              <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                Nothing here
              </p>
            )}

            {/* Only on the first column: a deal enters the pipeline, it does not
                appear halfway down it. */}
            {stage.position === stages[0]?.position && (
              <Button asChild variant="ghost" size="sm" className="mt-auto">
                <Link href={newDealHref}>
                  <Plus />
                  New deal
                </Link>
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

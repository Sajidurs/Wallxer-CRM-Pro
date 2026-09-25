import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { StageSummary } from "../queries";

interface PipelineSummaryProps {
  stages: StageSummary[];
}

/**
 * Deals per stage, as a simple bar. Section 8.1 asks for exactly this and no
 * more — a chart library for five horizontal bars would be weight without a
 * job, and these are div widths.
 */
export function PipelineSummary({ stages }: PipelineSummaryProps) {
  // Won and lost are outcomes, not stages of work in flight. Including them
  // would make the bars compare a backlog against an archive.
  const open = stages.filter((stage) => !stage.is_won && !stage.is_lost);
  const total = open.reduce((sum, stage) => sum + stage.deal_count, 0);
  const widest = Math.max(1, ...open.map((stage) => stage.deal_count));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pipeline</CardTitle>
      </CardHeader>
      <CardContent>
        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No stages yet. An admin can set them up in Settings → Pipelines.
          </p>
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No open deals.{" "}
            <Link href="/pipeline/new" className="underline">
              Raise one
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {open.map((stage) => (
              <li key={stage.stage_id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: stage.color }}
                      aria-hidden
                    />
                    <span className="truncate">{stage.stage_name}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {stage.deal_count}
                  </span>
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={`${stage.deal_count} deals in ${stage.stage_name}`}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      // Scaled to the largest column rather than the total, so
                      // a small stage is still visible next to a big one.
                      width: `${(stage.deal_count / widest) * 100}%`,
                      backgroundColor: stage.color,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

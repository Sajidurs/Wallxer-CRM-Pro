import Link from "next/link";

import type { CounterConfig } from "../widgets";
import type { DashboardCounts } from "../queries";

interface StatStripProps {
  counters: CounterConfig[];
  counts: DashboardCounts;
}

/**
 * One bordered strip of inline figures, as in the reference — not five cards.
 *
 * Five separate cards give each number equal visual weight and a lot of empty
 * box around it, which makes a summary feel like the main event. A single row
 * of small figures reads in one glance and leaves the page to the things that
 * actually need attention.
 */
export function StatStrip({ counters, counts }: StatStripProps) {
  return (
    <div className="flex flex-wrap items-stretch divide-x divide-border overflow-hidden rounded-xl border bg-card">
      {counters.map((counter) => {
        const value = counts[counter.key];
        const alarming = counter.alarming && value > 0;

        return (
          <Link
            key={counter.key}
            href={counter.href}
            className="group flex min-w-0 flex-1 items-center gap-2.5 px-4 py-3 transition-colors hover:bg-accent/60"
          >
            <counter.icon
              className={`size-4 shrink-0 ${
                alarming ? "text-destructive" : "text-muted-foreground"
              }`}
            />
            <span
              className={`text-sm font-semibold tabular-nums ${
                alarming ? "text-destructive" : ""
              }`}
            >
              {value}
            </span>
            <span className="truncate text-sm text-muted-foreground">
              {counter.label.toLowerCase()}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

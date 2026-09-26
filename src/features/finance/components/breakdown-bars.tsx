import { formatPoisha } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Row {
  key: string;
  label: string;
  value: number;
}

interface BreakdownBarsProps {
  rows: Row[];
  /** Which validated series colour the bars carry. */
  tone: "income" | "expense";
  empty: string;
}

/**
 * Ranked magnitude, drawn in plain HTML rather than SVG.
 *
 * A horizontal bar per category, longest first, with the amount written beside
 * it. The number is the point; the bar is there to make the ranking readable at
 * a glance, so every row is directly labelled and nothing depends on reading a
 * length against an axis.
 */
export function BreakdownBars({ rows, tone, empty }: BreakdownBarsProps) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }

  const peak = Math.max(...rows.map((r) => r.value), 1);
  const colour = tone === "income" ? "var(--series-income)" : "var(--series-expense)";

  return (
    <ul className="viz space-y-2.5">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{row.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatPoisha(row.value)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((row.value / peak) * 100, 1)}%`,
                backgroundColor: colour,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

interface ProfitRow {
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
}

/**
 * Profit and loss per project — a diverging scale, because the interesting
 * thing about a net figure is which side of zero it falls on.
 *
 * The sign is written out beside every bar, so the colour is never the only
 * thing saying "this one lost money".
 */
export function ProfitBars({ rows, empty }: { rows: ProfitRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }

  const widest = Math.max(...rows.map((r) => Math.abs(r.net)), 1);

  return (
    <ul className="viz space-y-3">
      {rows.map((row) => {
        const loss = row.net < 0;
        const share = (Math.abs(row.net) / widest) * 50;

        return (
          <li key={row.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{row.label}</span>
              <span
                className={cn(
                  "shrink-0 tabular-nums font-medium",
                  loss ? "text-destructive" : "text-foreground",
                )}
              >
                {loss ? "−" : "+"}
                {formatPoisha(Math.abs(row.net))}
              </span>
            </div>

            {/* A centre line at zero, with the bar running left for a loss and
                right for a profit. */}
            <div className="relative mt-1.5 h-1.5 w-full rounded-full bg-muted">
              <span
                className="absolute inset-y-[-2px] left-1/2 w-px bg-border"
                aria-hidden
              />
              <div
                className="absolute top-0 h-full rounded-full"
                style={{
                  width: `${Math.max(share, 0.5)}%`,
                  left: loss ? `${50 - Math.max(share, 0.5)}%` : "50%",
                  backgroundColor: loss
                    ? "var(--series-negative)"
                    : "var(--series-positive)",
                }}
              />
            </div>

            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              {formatPoisha(row.income)} in · {formatPoisha(row.expense)} out
            </p>
          </li>
        );
      })}
    </ul>
  );
}

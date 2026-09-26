"use client";

import { useState } from "react";

import { formatPoisha, formatPoishaCompact } from "@/lib/money";
import { cn } from "@/lib/utils";

import type { SeriesPoint } from "../queries";

interface TrendChartProps {
  points: SeriesPoint[];
  /** Pre-formatted bucket labels, so date handling stays on the server. */
  labels: string[];
}

const HEIGHT = 200;
const PAD_TOP = 8;
const PAD_BOTTOM = 24;
const PLOT = HEIGHT - PAD_TOP - PAD_BOTTOM;

/** A bar with only its top corners rounded, because it stands on the baseline. */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, w / 2, Math.max(h, 0));
  if (h <= 0) return "";
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + radius}`,
    `Q ${x} ${y} ${x + radius} ${y}`,
    `L ${x + w - radius} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + radius}`,
    `L ${x + w} ${y + h}`,
    "Z",
  ].join(" ");
}

/** A round number at or above the peak, so the axis reads in whole steps. */
function niceCeiling(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Income against expense over time.
 *
 * Grouped bars rather than two lines: these are discrete periods being
 * compared, not a continuous signal being traced. One y-axis, always — two
 * scales on one chart is the mistake that makes any two series look correlated.
 */
export function TrendChart({ points, labels }: TrendChartProps) {
  const [active, setActive] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Nothing recorded in this period yet.
      </p>
    );
  }

  const peak = Math.max(...points.flatMap((p) => [p.income, p.expense]), 0);
  const ceiling = niceCeiling(peak);

  const width = Math.max(points.length * 56, 320);
  const slot = width / points.length;
  // Two bars per slot with a 2px gap between them, and breathing room either
  // side so neighbouring groups do not read as one block.
  const barWidth = Math.min((slot - 14) / 2, 18);

  const gridlines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="viz">
      <div className="mb-3 flex items-center gap-4">
        <Legend swatch="var(--series-income)" label="Income" />
        <Legend swatch="var(--series-expense)" label="Expense" />
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="h-[200px] w-full min-w-[320px]"
          role="img"
          aria-label={`Income and expense by period. Peak ${formatPoisha(peak)}.`}
        >
          {gridlines.map((g) => (
            <line
              key={g}
              x1={0}
              x2={width}
              y1={PAD_TOP + PLOT * (1 - g)}
              y2={PAD_TOP + PLOT * (1 - g)}
              className="stroke-border"
              strokeWidth={1}
            />
          ))}

          {points.map((point, i) => {
            const incomeH = (point.income / ceiling) * PLOT;
            const expenseH = (point.expense / ceiling) * PLOT;
            const centre = slot * i + slot / 2;
            const incomeX = centre - barWidth - 1;
            const expenseX = centre + 1;

            return (
              <g key={point.bucket}>
                <path
                  d={barPath(incomeX, PAD_TOP + PLOT - incomeH, barWidth, incomeH, 4)}
                  fill="var(--series-income)"
                  opacity={active === null || active === i ? 1 : 0.35}
                />
                <path
                  d={barPath(expenseX, PAD_TOP + PLOT - expenseH, barWidth, expenseH, 4)}
                  fill="var(--series-expense)"
                  opacity={active === null || active === i ? 1 : 0.35}
                />

                <text
                  x={centre}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {labels[i]}
                </text>

                {/* A hit target the height of the plot, so the tooltip does not
                    demand that you hover a 4px-wide bar. */}
                <rect
                  x={slot * i}
                  y={0}
                  width={slot}
                  height={HEIGHT}
                  fill="transparent"
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive((c) => (c === i ? null : c))}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>0</span>
        <span>Scale to {formatPoishaCompact(ceiling)}</span>
      </div>

      {active !== null && (
        <div className="mt-3 rounded-lg border border-border bg-card p-3 text-sm shadow-xs">
          <p className="font-medium">{labels[active]}</p>
          <dl className="mt-1.5 space-y-1">
            <Row
              swatch="var(--series-income)"
              label="Income"
              value={formatPoisha(points[active].income)}
            />
            <Row
              swatch="var(--series-expense)"
              label="Expense"
              value={formatPoisha(points[active].expense)}
            />
            <div className="flex items-center justify-between border-t border-border pt-1 text-xs">
              <dt className="text-muted-foreground">Net</dt>
              <dd
                className={cn(
                  "font-medium tabular-nums",
                  points[active].income - points[active].expense < 0
                    ? "text-destructive"
                    : "text-foreground",
                )}
              >
                {formatPoisha(points[active].income - points[active].expense)}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className="size-2.5 shrink-0 rounded-sm"
        style={{ backgroundColor: swatch }}
        aria-hidden
      />
      {label}
    </span>
  );
}

function Row({
  swatch,
  label,
  value,
}: {
  swatch: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 text-xs">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        <span
          className="size-2 shrink-0 rounded-sm"
          style={{ backgroundColor: swatch }}
          aria-hidden
        />
        {label}
      </dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

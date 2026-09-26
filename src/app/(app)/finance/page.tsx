import { format, startOfMonth, startOfWeek, startOfYear, subDays, subMonths, subYears } from "date-fns";
import { Plus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BreakdownBars, ProfitBars } from "@/features/finance/components/breakdown-bars";
import { TrendChart } from "@/features/finance/components/trend-chart";
import { getByCategory, getByProject, getSeries } from "@/features/finance/queries";
import { BUCKETS, BUCKET_LABELS, reportFiltersSchema, type Bucket } from "@/features/finance/schema";
import { requireFinanceAccess } from "@/lib/auth";
import { formatPoisha } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Finance" };

/**
 * How far back each granularity looks, and how its buckets are labelled.
 * Kept here rather than in the chart so all date handling stays on the server —
 * a chart that formats dates in the browser disagrees with the server the
 * moment the two are in different timezones.
 */
const WINDOW: Record<Bucket, { start: (now: Date, n: number) => Date; label: string }> = {
  week: { start: (now, n) => startOfWeek(subDays(now, n * 7), { weekStartsOn: 1 }), label: "d MMM" },
  month: { start: (now, n) => startOfMonth(subMonths(now, n)), label: "MMM yy" },
  year: { start: (now, n) => startOfYear(subYears(now, n)), label: "yyyy" },
};

export default async function FinancePage(props: PageProps<"/finance">) {
  await requireFinanceAccess();

  const searchParams = await props.searchParams;
  const parsed = reportFiltersSchema.safeParse(searchParams);
  const filters = parsed.success ? parsed.data : reportFiltersSchema.parse({});

  const now = new Date();
  const start = WINDOW[filters.bucket].start(now, filters.range - 1);
  const from = format(start, "yyyy-MM-dd");
  const to = format(now, "yyyy-MM-dd");

  const [series, byCategory, byProject] = await Promise.all([
    getSeries(from, to, filters.bucket),
    getByCategory(from, to),
    getByProject(from, to),
  ]);

  const income = series.reduce((sum, p) => sum + p.income, 0);
  const expense = series.reduce((sum, p) => sum + p.expense, 0);
  const net = income - expense;

  const labels = series.map((p) =>
    format(new Date(`${p.bucket}T00:00:00`), WINDOW[filters.bucket].label),
  );

  const expenseCategories = byCategory
    .filter((c) => c.kind === "expense")
    .map((c) => ({ key: c.categoryId ?? c.name, label: c.name, value: c.total }));

  const incomeCategories = byCategory
    .filter((c) => c.kind === "income")
    .map((c) => ({ key: c.categoryId ?? c.name, label: c.name, value: c.total }));

  const projects = byProject
    .filter((p) => p.income > 0 || p.expense > 0)
    .map((p) => ({ key: p.projectId ?? p.name, label: p.name, ...p }))
    .sort((a, b) => b.net - a.net)
    .slice(0, 8);

  return (
    <>
      <PageHeader
        title="Finance"
        description={`${format(start, "d MMM yyyy")} to ${format(now, "d MMM yyyy")}`}
        actions={
          <Button asChild>
            <Link href="/finance/new">
              <Plus />
              Record
            </Link>
          </Button>
        }
      />

      {/* One row of figures rather than three cards. The numbers are the
          headline; a chart for three values would be decoration. */}
      <div className="grid grid-cols-1 divide-y divide-border rounded-lg border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Figure label="Income" value={formatPoisha(income)} />
        <Figure label="Expense" value={formatPoisha(expense)} />
        <Figure
          label={net < 0 ? "Net loss" : "Net profit"}
          value={formatPoisha(net)}
          tone={net < 0 ? "negative" : "positive"}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle>Income and expense</CardTitle>
          {/* Filters in one row above the chart. */}
          <div className="flex rounded-md border border-border p-0.5">
            {BUCKETS.map((b) => (
              <Button
                key={b}
                asChild
                size="sm"
                variant={filters.bucket === b ? "secondary" : "ghost"}
              >
                <Link href={`/finance?bucket=${b}`}>{BUCKET_LABELS[b]}</Link>
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <TrendChart points={series} labels={labels} />

          {/* The table view the chart's numbers come from, so nothing here is
              reachable only by reading a bar. */}
          {series.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                Show these figures as a table
              </summary>
              <table className="mt-2 w-full border-collapse text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="border-b border-border px-2 py-1.5 text-left font-normal">
                      Period
                    </th>
                    <th className="border-b border-border px-2 py-1.5 text-right font-normal">
                      Income
                    </th>
                    <th className="border-b border-border px-2 py-1.5 text-right font-normal">
                      Expense
                    </th>
                    <th className="border-b border-border px-2 py-1.5 text-right font-normal">
                      Net
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((point, i) => (
                    <tr key={point.bucket}>
                      <td className="border-b border-border px-2 py-1.5">{labels[i]}</td>
                      <td className="border-b border-border px-2 py-1.5 text-right tabular-nums">
                        {formatPoisha(point.income)}
                      </td>
                      <td className="border-b border-border px-2 py-1.5 text-right tabular-nums">
                        {formatPoisha(point.expense)}
                      </td>
                      <td className="border-b border-border px-2 py-1.5 text-right tabular-nums">
                        {formatPoisha(point.income - point.expense)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Where the money went</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownBars
              rows={expenseCategories}
              tone="expense"
              empty="No expenses in this period."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where it came from</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownBars
              rows={incomeCategories}
              tone="income"
              empty="No income in this period."
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profit by project</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfitBars
            rows={projects}
            empty="Nothing has been attributed to a project yet."
          />
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button asChild variant="outline">
          <Link href="/finance/transactions">
            <Wallet />
            See every transaction
          </Link>
        </Button>
      </div>
    </>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums tracking-tight",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}

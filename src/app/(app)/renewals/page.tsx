import { CalendarClock, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { listContactOptions } from "@/features/contacts/queries";
import { RenewalsTable } from "@/features/renewals/components/renewals-table";
import { getRenewalSummary, listRenewals } from "@/features/renewals/queries";
import {
  CATEGORY_LABELS,
  RENEWAL_CATEGORIES,
  renewalFiltersSchema,
} from "@/features/renewals/schema";
import { requireUser } from "@/lib/auth";
import { formatMinor, type Currency } from "@/lib/money";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Renewals" };

const DUE_FILTERS = [
  { key: undefined, label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "30", label: "Next 30 days" },
  { key: "90", label: "Next 90 days" },
] as const;

export default async function RenewalsPage(props: PageProps<"/renewals">) {
  const actor = await requireUser();

  const searchParams = await props.searchParams;
  const parsed = renewalFiltersSchema.safeParse(searchParams);
  const filters = parsed.success ? parsed.data : renewalFiltersSchema.parse({});

  const [result, clients, summary] = await Promise.all([
    listRenewals(filters),
    listContactOptions(),
    getRenewalSummary(),
  ]);

  const hasFilters = Boolean(
    filters.q || filters.category || filters.status || filters.due,
  );

  const canEdit = can(actor, "update", "project");
  const canDelete = can(actor, "delete", "project");

  return (
    <>
      <PageHeader
        title="Renewals"
        description="Hosting, domains and tool licences, and when each one comes round again."
        actions={
          canEdit && (
            <Button asChild>
              <Link href="/renewals/new">
                <Plus />
                Add renewal
              </Link>
            </Button>
          )
        }
      />

      {/* Overdue first, because that is the number that costs money. */}
      <div className="grid grid-cols-2 divide-border rounded-lg border border-border sm:grid-cols-4 sm:divide-x">
        <Figure
          label="Overdue"
          value={String(summary.overdue)}
          tone={summary.overdue > 0 ? "bad" : "calm"}
          href="/renewals?due=overdue"
        />
        <Figure
          label="Due in 30 days"
          value={String(summary.dueSoon)}
          tone={summary.dueSoon > 0 ? "warn" : "calm"}
          href="/renewals?due=30"
        />
        <Figure label="Active" value={String(summary.active)} />
        <Figure
          label="A year of it"
          value={
            summary.annual.length === 0
              ? "—"
              : summary.annual
                  .map((a) => formatMinor(a.total, a.currency as Currency))
                  .join(" · ")
          }
        />
      </div>

      {/* Filters in one row above the table. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border p-0.5">
          {DUE_FILTERS.map((f) => (
            <Button
              key={f.label}
              asChild
              size="sm"
              variant={filters.due === f.key ? "secondary" : "ghost"}
            >
              <Link href={f.key ? `/renewals?due=${f.key}` : "/renewals"}>
                {f.label}
              </Link>
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          {RENEWAL_CATEGORIES.map((category) => (
            <Button
              key={category}
              asChild
              size="sm"
              variant={filters.category === category ? "secondary" : "ghost"}
            >
              <Link
                href={
                  filters.category === category
                    ? "/renewals"
                    : `/renewals?category=${category}`
                }
              >
                {CATEGORY_LABELS[category]}
              </Link>
            </Button>
          ))}
        </div>
      </div>

      {result.renewals.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={hasFilters ? "Nothing matches those filters" : "Nothing tracked yet"}
          description={
            hasFilters
              ? "Try clearing a filter."
              : "Add the hosting, domains and tool licences you resell, and this page will tell you what is coming up."
          }
          action={
            !hasFilters &&
            canEdit && (
              <Button asChild>
                <Link href="/renewals/new">
                  <Plus />
                  Add the first one
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          <RenewalsTable
            renewals={result.renewals}
            clients={clients}
            canEdit={canEdit}
            canDelete={canDelete}
          />
          <Suspense fallback={null}>
            <Pagination
              page={result.page}
              pageCount={result.pageCount}
              total={result.total}
              label="renewals"
            />
          </Suspense>
        </div>
      )}
    </>
  );
}

function Figure({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: string;
  tone?: "bad" | "warn" | "calm";
  href?: string;
}) {
  const body = (
    <div className="px-5 py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums tracking-tight",
          tone === "bad" && "text-destructive",
          tone === "warn" && "text-[#97663B] dark:text-[#e2bd8a]",
        )}
      >
        {value}
      </p>
    </div>
  );

  return href ? (
    <Link href={href} className="transition-colors hover:bg-accent/40">
      {body}
    </Link>
  ) : (
    body
  );
}

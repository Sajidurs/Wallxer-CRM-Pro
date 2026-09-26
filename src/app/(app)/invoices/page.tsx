import { format, isPast } from "date-fns";
import { FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { Pill, type PillTone } from "@/components/common/pill";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { listBrandOptions } from "@/features/brands/queries";
import { listContactOptions } from "@/features/contacts/queries";
import { getInvoiceSummary, listInvoices } from "@/features/invoices/queries";
import {
  INVOICE_STATUS_LABELS,
  invoiceFiltersSchema,
  type InvoiceStatus,
} from "@/features/invoices/schema";
import { requireFinanceAccess } from "@/lib/auth";
import { formatMinor, type Currency } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Invoices" };

const STATUS_TONE: Record<InvoiceStatus, PillTone> = {
  draft: "grey",
  sent: "blue",
  paid: "green",
  cancelled: "red",
};

export default async function InvoicesPage(props: PageProps<"/invoices">) {
  await requireFinanceAccess();

  const searchParams = await props.searchParams;
  const parsed = invoiceFiltersSchema.safeParse(searchParams);
  const filters = parsed.success ? parsed.data : invoiceFiltersSchema.parse({});

  const [result, brands, clients, summary] = await Promise.all([
    listInvoices(filters),
    listBrandOptions(),
    listContactOptions(),
    getInvoiceSummary(),
  ]);

  const brandById = new Map(brands.map((b) => [b.id, b]));
  const clientById = new Map(clients.map((c) => [c.id, c]));

  // Outstanding is what someone actually wants to know, and it only means
  // anything per currency — adding taka to euros would be a fiction.
  const outstanding = summary.filter((s) => s.status === "sent");

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Issued from your companies, with their own letterhead and numbering."
        actions={
          <Button asChild>
            <Link href="/invoices/new">
              <Plus />
              New invoice
            </Link>
          </Button>
        }
      />

      {outstanding.length > 0 && (
        <div className="grid grid-cols-1 divide-y divide-border rounded-lg border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {outstanding.map((row) => (
            <div key={`${row.status}-${row.currency}`} className="px-5 py-4">
              <p className="text-xs text-muted-foreground">
                Outstanding · {row.currency}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
                {formatMinor(row.total, row.currency as Currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                {row.count} invoice{row.count === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      )}

      {result.invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description="Pick a company, add the lines, and it gets its own number automatically."
          action={
            <Button asChild>
              <Link href="/invoices/new">
                <Plus />
                Create the first one
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <Th>Number</Th>
                  <Th className="hidden sm:table-cell">Company</Th>
                  <Th className="hidden md:table-cell">Client</Th>
                  <Th className="hidden lg:table-cell">Issued</Th>
                  <Th className="hidden lg:table-cell">Due</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {result.invoices.map((invoice) => {
                  const brand = brandById.get(invoice.brand_id);
                  const client = invoice.contact_id
                    ? clientById.get(invoice.contact_id)
                    : null;
                  const overdue =
                    invoice.status === "sent" &&
                    invoice.due_date &&
                    isPast(new Date(`${invoice.due_date}T23:59:59`));

                  return (
                    <tr key={invoice.id} className="group transition-colors hover:bg-accent/40">
                      <td className={CELL}>
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="font-mono font-medium decoration-muted-foreground/40 underline-offset-[3px] group-hover:underline"
                        >
                          {invoice.number}
                        </Link>
                      </td>
                      <td className={cn(CELL, "hidden sm:table-cell")}>
                        {brand ? (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: brand.color }}
                              aria-hidden
                            />
                            {brand.name}
                          </span>
                        ) : (
                          EMPTY
                        )}
                      </td>
                      <td className={cn(CELL, "hidden md:table-cell")}>
                        {client ? client.name : EMPTY}
                      </td>
                      <td className={cn(CELL, "hidden whitespace-nowrap lg:table-cell")}>
                        {format(new Date(`${invoice.issue_date}T00:00:00`), "d MMM yyyy")}
                      </td>
                      <td className={cn(CELL, "hidden whitespace-nowrap lg:table-cell")}>
                        {invoice.due_date ? (
                          <span className={overdue ? "font-medium text-destructive" : ""}>
                            {format(new Date(`${invoice.due_date}T00:00:00`), "d MMM yyyy")}
                            {overdue && " · overdue"}
                          </span>
                        ) : (
                          EMPTY
                        )}
                      </td>
                      <td className={CELL}>
                        <Pill tone={STATUS_TONE[invoice.status as InvoiceStatus]} dot>
                          {INVOICE_STATUS_LABELS[invoice.status as InvoiceStatus]}
                        </Pill>
                      </td>
                      <td className={cn(CELL, "text-right whitespace-nowrap tabular-nums")}>
                        {formatMinor(
                          Number(invoice.total_minor),
                          invoice.currency as Currency,
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Suspense fallback={null}>
            <Pagination
              page={result.page}
              pageCount={result.pageCount}
              total={result.total}
              label="invoices"
            />
          </Suspense>
        </div>
      )}
    </>
  );
}

const CELL =
  "border-b border-r border-border px-3 py-2 align-middle last:border-r-0";

const EMPTY = <span className="text-muted-foreground/50">&mdash;</span>;

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "border-b border-r border-border px-3 py-2 text-left align-middle font-normal last:border-r-0",
        className,
      )}
    >
      {children}
    </th>
  );
}

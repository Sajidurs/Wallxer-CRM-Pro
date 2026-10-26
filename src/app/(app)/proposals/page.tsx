import { format, isPast } from "date-fns";
import { FileSignature, Plus } from "lucide-react";
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
import { getProposalSummary, listProposals } from "@/features/proposals/queries";
import {
  PROPOSAL_STATUS_LABELS,
  proposalFiltersSchema,
  type ProposalStatus,
} from "@/features/proposals/schema";
import { requireUser } from "@/lib/auth";
import { formatMinor, type Currency } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Proposals" };

const STATUS_TONE: Record<ProposalStatus, PillTone> = {
  draft: "grey",
  sent: "blue",
  accepted: "green",
  declined: "red",
};

export default async function ProposalsPage(props: PageProps<"/proposals">) {
  await requireUser();

  const searchParams = await props.searchParams;
  const parsed = proposalFiltersSchema.safeParse(searchParams);
  const filters = parsed.success ? parsed.data : proposalFiltersSchema.parse({});

  const [result, brands, clients, summary] = await Promise.all([
    listProposals(filters),
    listBrandOptions(),
    listContactOptions(),
    getProposalSummary(),
  ]);

  const brandById = new Map(brands.map((b) => [b.id, b]));
  const clientById = new Map(clients.map((c) => [c.id, c]));

  // What is out with a client and still undecided, and what has been won.
  // Per currency, because adding taka to euros would be a fiction.
  const pending = summary.filter((s) => s.status === "sent");
  const won = summary.filter((s) => s.status === "accepted");

  return (
    <>
      <PageHeader
        title="Proposals"
        description="What you have put in front of a client, and how it went."
        actions={
          <Button asChild>
            <Link href="/proposals/new">
              <Plus />
              New proposal
            </Link>
          </Button>
        }
      />

      {pending.length + won.length > 0 && (
        <div className="grid grid-cols-1 divide-y divide-border rounded-lg border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            ...pending.map((row) => ({ ...row, label: "Awaiting a decision" })),
            ...won.map((row) => ({ ...row, label: "Accepted" })),
          ].map((row) => (
            <div key={`${row.status}-${row.currency}`} className="px-5 py-4">
              <p className="text-xs text-muted-foreground">
                {row.label} · {row.currency}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
                {formatMinor(row.total, row.currency as Currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                {row.count} proposal{row.count === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      )}

      {result.proposals.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No proposals yet"
          description="Pick a client, write what you are offering, and send them the PDF."
          action={
            <Button asChild>
              <Link href="/proposals/new">
                <Plus />
                Write the first one
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
                  <Th>Proposal</Th>
                  <Th className="hidden md:table-cell">Client</Th>
                  <Th className="hidden sm:table-cell">Company</Th>
                  <Th className="hidden lg:table-cell">Date</Th>
                  <Th className="hidden lg:table-cell">Valid until</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Value</Th>
                </tr>
              </thead>
              <tbody>
                {result.proposals.map((proposal) => {
                  const brand = brandById.get(proposal.brand_id);
                  const client = proposal.contact_id
                    ? clientById.get(proposal.contact_id)
                    : null;
                  const expired =
                    proposal.status === "sent" &&
                    proposal.valid_until &&
                    isPast(new Date(`${proposal.valid_until}T23:59:59`));

                  return (
                    <tr
                      key={proposal.id}
                      className="group transition-colors hover:bg-accent/40"
                    >
                      <td className={CELL}>
                        <Link
                          href={`/proposals/${proposal.id}`}
                          className="font-medium decoration-muted-foreground/40 underline-offset-[3px] group-hover:underline"
                        >
                          {proposal.title}
                        </Link>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {proposal.number}
                        </span>
                      </td>
                      <td className={cn(CELL, "hidden md:table-cell")}>
                        {client ? client.name : EMPTY}
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
                      <td className={cn(CELL, "hidden whitespace-nowrap lg:table-cell")}>
                        {format(new Date(`${proposal.issue_date}T00:00:00`), "d MMM yyyy")}
                      </td>
                      <td className={cn(CELL, "hidden whitespace-nowrap lg:table-cell")}>
                        {proposal.valid_until ? (
                          <span className={expired ? "font-medium text-destructive" : ""}>
                            {format(
                              new Date(`${proposal.valid_until}T00:00:00`),
                              "d MMM yyyy",
                            )}
                            {expired && " · expired"}
                          </span>
                        ) : (
                          EMPTY
                        )}
                      </td>
                      <td className={CELL}>
                        <Pill tone={STATUS_TONE[proposal.status as ProposalStatus]} dot>
                          {PROPOSAL_STATUS_LABELS[proposal.status as ProposalStatus]}
                        </Pill>
                      </td>
                      <td className={cn(CELL, "text-right whitespace-nowrap tabular-nums")}>
                        {Number(proposal.total_minor) > 0
                          ? formatMinor(
                              Number(proposal.total_minor),
                              proposal.currency as Currency,
                            )
                          : EMPTY}
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
              label="proposals"
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

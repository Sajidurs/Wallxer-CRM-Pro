import { format } from "date-fns";
import Link from "next/link";

import { Pill, type PillTone } from "@/components/common/pill";
import { formatMinor, type Currency } from "@/lib/money";
import { cn } from "@/lib/utils";

import type { Renewal } from "../queries";
import {
  CATEGORY_LABELS,
  CYCLE_LABELS,
  daysUntil,
  type RenewalCategory,
  type RenewalCycle,
  type RenewalStatus,
} from "../schema";
import { RenewalRowActions } from "./renewal-row-actions";

interface RenewalsTableProps {
  renewals: Renewal[];
  clients: { id: string; name: string }[];
  canEdit: boolean;
  canDelete: boolean;
}

const CATEGORY_TONE: Record<RenewalCategory, PillTone> = {
  hosting: "blue",
  domain: "purple",
  tool: "amber",
  ssl: "green",
  email: "pink",
  maintenance: "grey",
  other: "grey",
};

const CELL =
  "border-b border-r border-border px-3 py-2 align-middle last:border-r-0";

const EMPTY = <span className="text-muted-foreground/50">&mdash;</span>;

/**
 * Ordered by what is due next, and the due column is the one that shouts.
 *
 * "in 12 days" beats a date for the only question anyone brings here. The date
 * is still shown underneath, because at renewal time you need the actual day.
 */
function dueLabel(renewal: Renewal): { text: string; tone: "overdue" | "soon" | "calm" } {
  if (renewal.status !== "active") {
    return { text: "—", tone: "calm" };
  }

  const days = daysUntil(renewal.next_renewal_on);

  if (days < 0) {
    const late = Math.abs(days);
    return { text: `${late} day${late === 1 ? "" : "s"} overdue`, tone: "overdue" };
  }
  if (days === 0) return { text: "Due today", tone: "overdue" };
  if (days === 1) return { text: "Tomorrow", tone: "soon" };
  if (days <= 30) return { text: `in ${days} days`, tone: "soon" };
  return { text: `in ${days} days`, tone: "calm" };
}

export function RenewalsTable({
  renewals,
  clients,
  canEdit,
  canDelete,
}: RenewalsTableProps) {
  const clientById = new Map(clients.map((c) => [c.id, c]));

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <Th className="min-w-[200px]">Service</Th>
            <Th className="hidden md:table-cell">Client</Th>
            <Th className="hidden lg:table-cell">Cycle</Th>
            <Th className="hidden xl:table-cell">Started</Th>
            <Th className="hidden xl:table-cell">Last renewed</Th>
            <Th>Next renewal</Th>
            <Th className="hidden sm:table-cell text-right">Price</Th>
            <th className="w-10 border-b border-border" />
          </tr>
        </thead>

        <tbody>
          {renewals.map((renewal) => {
            const client = renewal.contact_id
              ? clientById.get(renewal.contact_id)
              : null;
            const due = dueLabel(renewal);

            return (
              <tr
                key={renewal.id}
                className="group transition-colors hover:bg-accent/40"
              >
                <td className={CELL}>
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{renewal.name}</span>
                    {renewal.status !== "active" && (
                      <Pill tone={renewal.status === "lapsed" ? "red" : "grey"} dot>
                        {renewal.status === "lapsed" ? "Lapsed" : "Cancelled"}
                      </Pill>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Pill tone={CATEGORY_TONE[renewal.category as RenewalCategory]}>
                      {CATEGORY_LABELS[renewal.category as RenewalCategory]}
                    </Pill>
                    {renewal.vendor && (
                      <span className="truncate text-xs text-muted-foreground">
                        {renewal.vendor}
                      </span>
                    )}
                  </div>
                </td>

                <td className={cn(CELL, "hidden md:table-cell")}>
                  {client ? (
                    <Link
                      href={`/contacts/${client.id}`}
                      className="truncate underline decoration-border underline-offset-[3px] hover:decoration-foreground"
                    >
                      {client.name}
                    </Link>
                  ) : (
                    EMPTY
                  )}
                </td>

                <td className={cn(CELL, "hidden whitespace-nowrap lg:table-cell")}>
                  <span className="text-muted-foreground">
                    {CYCLE_LABELS[renewal.cycle as RenewalCycle]}
                  </span>
                  {!renewal.auto_renew && (
                    <span className="ml-1.5 text-xs text-muted-foreground/70">
                      · manual
                    </span>
                  )}
                </td>

                <td className={cn(CELL, "hidden whitespace-nowrap xl:table-cell")}>
                  {format(new Date(`${renewal.started_on}T00:00:00`), "d MMM yyyy")}
                </td>

                <td className={cn(CELL, "hidden whitespace-nowrap xl:table-cell")}>
                  {renewal.last_renewed_on
                    ? format(new Date(`${renewal.last_renewed_on}T00:00:00`), "d MMM yyyy")
                    : EMPTY}
                </td>

                <td className={cn(CELL, "whitespace-nowrap")}>
                  <span
                    className={cn(
                      "font-medium",
                      due.tone === "overdue" && "text-destructive",
                      due.tone === "soon" && "text-[#97663B] dark:text-[#e2bd8a]",
                    )}
                  >
                    {due.text}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {format(new Date(`${renewal.next_renewal_on}T00:00:00`), "d MMM yyyy")}
                  </span>
                </td>

                <td className={cn(CELL, "hidden text-right whitespace-nowrap sm:table-cell")}>
                  {renewal.price_minor === null ? (
                    EMPTY
                  ) : (
                    <span className="tabular-nums">
                      {formatMinor(Number(renewal.price_minor), renewal.currency as Currency)}
                    </span>
                  )}
                </td>

                <td className="border-b border-border px-1 py-2 align-middle">
                  <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <RenewalRowActions
                      renewal={{
                        id: renewal.id,
                        name: renewal.name,
                        status: renewal.status as RenewalStatus,
                      }}
                      canEdit={canEdit}
                      canDelete={canDelete}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

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

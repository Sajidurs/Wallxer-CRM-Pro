import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Pill } from "@/components/common/pill";
import { formatPoisha } from "@/lib/money";
import { cn } from "@/lib/utils";

import type { TransactionCategory, TransactionListItem } from "../queries";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "../schema";
import { TransactionRowActions } from "./transaction-row-actions";

interface TransactionsTableProps {
  transactions: TransactionListItem[];
  categories: TransactionCategory[];
  projects: { id: string; name: string }[];
  canEdit: boolean;
}

const CELL =
  "border-b border-r border-border px-3 py-2 align-middle last:border-r-0";

const EMPTY = <span className="text-muted-foreground/50">&mdash;</span>;

export function TransactionsTable({
  transactions,
  categories,
  projects,
  canEdit,
}: TransactionsTableProps) {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <Th className="min-w-[180px]">Description</Th>
            <Th className="hidden sm:table-cell">Date</Th>
            <Th className="hidden md:table-cell">Category</Th>
            <Th className="hidden lg:table-cell">Project</Th>
            <Th className="hidden xl:table-cell">Method</Th>
            <Th className="text-right">Amount</Th>
            <th className="w-10 border-b border-border" />
          </tr>
        </thead>

        <tbody>
          {transactions.map((txn) => {
            const category = txn.category_id ? categoryById.get(txn.category_id) : null;
            const project = txn.project_id ? projectById.get(txn.project_id) : null;
            const income = txn.kind === "income";

            return (
              <tr key={txn.id} className="group transition-colors hover:bg-accent/40">
                <td className={CELL}>
                  <div className="flex items-center gap-2">
                    {/* Direction is an arrow as well as a colour, so the row
                        still reads correctly without seeing hue. */}
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded",
                        income
                          ? "bg-[#E7F3F8] text-[#28647D] dark:bg-[#1d3a47] dark:text-[#9ecfe4]"
                          : "bg-[#FAEDDF] text-[#97663B] dark:bg-[#3a2c1a] dark:text-[#e2bd8a]",
                      )}
                      aria-hidden
                    >
                      {income ? (
                        <ArrowDownLeft className="size-3" />
                      ) : (
                        <ArrowUpRight className="size-3" />
                      )}
                    </span>
                    <span className="truncate font-medium">
                      {txn.description || (income ? "Income" : "Expense")}
                    </span>
                  </div>
                  {txn.reference && (
                    <span className="mt-0.5 block truncate pl-7 font-mono text-xs text-muted-foreground">
                      {txn.reference}
                    </span>
                  )}
                </td>

                <td className={cn(CELL, "hidden whitespace-nowrap sm:table-cell")}>
                  {format(new Date(txn.occurred_on), "d MMM yyyy")}
                </td>

                <td className={cn(CELL, "hidden md:table-cell")}>
                  {category ? (
                    <Pill tone={income ? "blue" : "amber"}>{category.name}</Pill>
                  ) : (
                    EMPTY
                  )}
                </td>

                <td className={cn(CELL, "hidden lg:table-cell")}>
                  {project ? (
                    <Link
                      href={`/projects/${project.id}`}
                      className="truncate underline decoration-border underline-offset-[3px] hover:decoration-foreground"
                    >
                      {project.name}
                    </Link>
                  ) : (
                    EMPTY
                  )}
                </td>

                <td className={cn(CELL, "hidden whitespace-nowrap xl:table-cell")}>
                  <span className="text-muted-foreground">
                    {PAYMENT_METHOD_LABELS[txn.payment_method as PaymentMethod] ??
                      txn.payment_method}
                  </span>
                </td>

                <td className={cn(CELL, "text-right whitespace-nowrap")}>
                  <span className="font-medium tabular-nums">
                    {income ? "+" : "−"}
                    {formatPoisha(txn.amount_poisha)}
                  </span>
                </td>

                <td className="border-b border-border px-1 py-2 align-middle">
                  <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <TransactionRowActions
                      transactionId={txn.id}
                      label={txn.description || "this transaction"}
                      canEdit={canEdit}
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

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "border-b border-r border-border px-3 py-2 text-left align-middle text-xs font-normal text-muted-foreground last:border-r-0",
        className,
      )}
    >
      {children}
    </th>
  );
}

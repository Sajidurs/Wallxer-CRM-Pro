"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { loadMoreTransactions } from "../actions";
import type { TransactionCategory, TransactionListItem } from "../queries";
import { LEDGER_STEP } from "../schema";
import { TransactionsTable } from "./transactions-table";

interface LedgerPanelProps {
  initial: TransactionListItem[];
  total: number;
  categories: TransactionCategory[];
  projects: { id: string; name: string }[];
}

/**
 * The ledger, on the finance page rather than behind a link.
 *
 * Rows are appended rather than paged, so reaching the twentieth transaction
 * does not mean losing the reports above it and coming back. The button asks
 * the server for the next slice only — re-rendering the page would recompute
 * every aggregate above just to add twenty rows.
 */
export function LedgerPanel({
  initial,
  total,
  categories,
  projects,
}: LedgerPanelProps) {
  const [rows, setRows] = useState(initial);
  const [isPending, startTransition] = useTransition();

  // The server's count at the time of the last fetch, so a row added in
  // another tab does not leave the button insisting there is nothing more.
  const [known, setKnown] = useState(total);

  const remaining = Math.max(known - rows.length, 0);

  function loadMore() {
    startTransition(async () => {
      const result = await loadMoreTransactions({
        offset: rows.length,
        limit: LEDGER_STEP,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      // Guard against a row being removed between fetches, which would
      // otherwise shift the window and duplicate one.
      const seen = new Set(rows.map((r) => r.id));
      const fresh = result.data.transactions.filter((r) => !seen.has(r.id));

      setRows((current) => [...current, ...fresh]);
      setKnown(result.data.total);
    });
  }

  return (
    <div className="space-y-3">
      <TransactionsTable
        transactions={rows}
        categories={categories}
        projects={projects}
        canEdit
      />

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          Showing {rows.length} of {known}
        </p>

        {remaining > 0 && (
          <Button variant="outline" size="sm" onClick={loadMore} disabled={isPending}>
            {isPending
              ? "Loading"
              : `Load ${Math.min(remaining, LEDGER_STEP)} more`}
          </Button>
        )}
      </div>
    </div>
  );
}

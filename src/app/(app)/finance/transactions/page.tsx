import { Plus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { TransactionsTable } from "@/features/finance/components/transactions-table";
import { listCategories, listTransactions } from "@/features/finance/queries";
import { transactionFiltersSchema } from "@/features/finance/schema";
import { listProjectOptions } from "@/features/projects/queries";
import { requireFinanceAccess } from "@/lib/auth";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage(
  props: PageProps<"/finance/transactions">,
) {
  await requireFinanceAccess();

  const searchParams = await props.searchParams;
  const parsed = transactionFiltersSchema.safeParse(searchParams);
  const filters = parsed.success ? parsed.data : transactionFiltersSchema.parse({});

  const [result, categories, projects] = await Promise.all([
    listTransactions(filters),
    listCategories(),
    listProjectOptions(),
  ]);

  const hasFilters = Boolean(
    filters.q || filters.kind || filters.categoryId || filters.projectId || filters.from,
  );

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every taka in and out, newest first."
        actions={
          <Button asChild>
            <Link href="/finance/new">
              <Plus />
              Record
            </Link>
          </Button>
        }
      />

      {result.transactions.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={hasFilters ? "Nothing matches those filters" : "No transactions yet"}
          description={
            hasFilters
              ? "Try clearing a filter, or widening the date range."
              : "Record an income or an expense and the reports build themselves."
          }
          action={
            !hasFilters && (
              <Button asChild>
                <Link href="/finance/new">
                  <Plus />
                  Record the first one
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          <TransactionsTable
            transactions={result.transactions}
            categories={categories}
            projects={projects}
            canEdit
          />
          <Suspense fallback={null}>
            <Pagination
              page={result.page}
              pageCount={result.pageCount}
              total={result.total}
              label="transactions"
            />
          </Suspense>
        </div>
      )}
    </>
  );
}

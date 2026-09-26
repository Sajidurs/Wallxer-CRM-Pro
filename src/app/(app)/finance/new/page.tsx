import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { listBrandOptions } from "@/features/brands/queries";
import { listContactOptions } from "@/features/contacts/queries";
import { TransactionForm } from "@/features/finance/components/transaction-form";
import { listCategories } from "@/features/finance/queries";
import { listProjectOptions } from "@/features/projects/queries";
import { requireFinanceAccess } from "@/lib/auth";

export const metadata: Metadata = { title: "Record a transaction" };

export default async function NewTransactionPage() {
  await requireFinanceAccess();

  const [categories, brands, projects, contacts] = await Promise.all([
    listCategories(),
    listBrandOptions(),
    listProjectOptions(),
    listContactOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Record a transaction"
        description="Money in or money out. Attach it to a project to see that project's profit."
      />

      <Card className="max-w-3xl">
        <CardContent>
          <TransactionForm
            categories={categories}
            brands={brands}
            projects={projects}
            contacts={contacts}
          />
        </CardContent>
      </Card>
    </>
  );
}

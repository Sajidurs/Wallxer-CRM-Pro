import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { listBrandOptions } from "@/features/brands/queries";
import { listContactOptions } from "@/features/contacts/queries";
import { TransactionForm } from "@/features/finance/components/transaction-form";
import { getTransaction, listCategories } from "@/features/finance/queries";
import type { PaymentMethod, TransactionKind } from "@/features/finance/schema";
import { listProjectOptions } from "@/features/projects/queries";
import { requireFinanceAccess } from "@/lib/auth";
import { poishaToInput } from "@/lib/money";

export const metadata: Metadata = { title: "Edit transaction" };

export default async function EditTransactionPage(
  props: PageProps<"/finance/[id]/edit">,
) {
  await requireFinanceAccess();

  const { id } = await props.params;
  const transaction = await getTransaction(id);
  if (!transaction) notFound();

  const [categories, brands, projects, contacts] = await Promise.all([
    listCategories(),
    listBrandOptions(),
    listProjectOptions(),
    listContactOptions(),
  ]);

  return (
    <>
      <PageHeader title="Edit transaction" />

      <Card className="max-w-3xl">
        <CardContent>
          <TransactionForm
            categories={categories}
            brands={brands}
            projects={projects}
            contacts={contacts}
            transactionId={transaction.id}
            defaultValues={{
              kind: transaction.kind as TransactionKind,
              // The stored integer becomes an editable decimal, never a float
              // that has been through arithmetic.
              amount: poishaToInput(transaction.amount_poisha),
              occurredOn: transaction.occurred_on,
              categoryId: transaction.category_id,
              brandId: transaction.brand_id,
              projectId: transaction.project_id,
              contactId: transaction.contact_id,
              paymentMethod: transaction.payment_method as PaymentMethod,
              reference: transaction.reference,
              description: transaction.description,
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}

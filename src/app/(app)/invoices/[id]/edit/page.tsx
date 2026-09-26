import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { listIssuerOptions } from "@/features/brands/queries";
import { listContactOptions } from "@/features/contacts/queries";
import { InvoiceForm } from "@/features/invoices/components/invoice-form";
import { getInvoice, listInvoiceItems } from "@/features/invoices/queries";
import type { InvoiceStatus } from "@/features/invoices/schema";
import { listProjectOptions } from "@/features/projects/queries";
import { requireFinanceAccess } from "@/lib/auth";
import { minorToInput, type Currency } from "@/lib/money";

export const metadata: Metadata = { title: "Edit invoice" };

export default async function EditInvoicePage(
  props: PageProps<"/invoices/[id]/edit">,
) {
  await requireFinanceAccess();

  const { id } = await props.params;
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  // The action refuses this too; catching it here means the form is never
  // rendered for an invoice that cannot accept it.
  if ((invoice.status as InvoiceStatus) !== "draft") {
    redirect(`/invoices/${invoice.id}`);
  }

  const [items, companies, clients, projects] = await Promise.all([
    listInvoiceItems(invoice.id),
    listIssuerOptions(),
    listContactOptions(),
    listProjectOptions(),
  ]);

  return (
    <>
      <PageHeader title={`Edit ${invoice.number}`} />

      <Card>
        <CardContent>
          <InvoiceForm
            companies={companies}
            clients={clients}
            projects={projects}
            invoiceId={invoice.id}
            defaultValues={{
              brandId: invoice.brand_id,
              contactId: invoice.contact_id,
              projectId: invoice.project_id,
              currency: invoice.currency as Currency,
              issueDate: invoice.issue_date,
              dueDate: invoice.due_date,
              taxRate: String(Number(invoice.tax_rate)),
              taxLabel: invoice.tax_label,
              notes: invoice.notes,
              terms: invoice.terms,
              items: items.map((item) => ({
                description: item.description,
                quantity: String(Number(item.quantity)),
                unitAmount: minorToInput(Number(item.unit_amount_minor)),
              })),
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}

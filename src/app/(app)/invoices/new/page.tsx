import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { listIssuerOptions } from "@/features/brands/queries";
import { listContactOptions } from "@/features/contacts/queries";
import { InvoiceForm } from "@/features/invoices/components/invoice-form";
import { listProjectOptions } from "@/features/projects/queries";
import { requireFinanceAccess } from "@/lib/auth";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  await requireFinanceAccess();

  const [companies, clients, projects] = await Promise.all([
    listIssuerOptions(),
    listContactOptions(),
    listProjectOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="New invoice"
        description="The company you choose supplies the letterhead and the number."
      />

      {companies.length === 0 && (
        <Alert>
          <AlertTriangle />
          <AlertDescription>
            There are no active companies to invoice from.{" "}
            <Link href="/settings/brands" className="underline underline-offset-2">
              Add one in Settings
            </Link>{" "}
            first.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <InvoiceForm companies={companies} clients={clients} projects={projects} />
        </CardContent>
      </Card>
    </>
  );
}

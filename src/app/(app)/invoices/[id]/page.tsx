import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Pill, type PillTone } from "@/components/common/pill";
import { signLogo } from "@/features/brands/logos";
import { getBrand } from "@/features/brands/queries";
import { getContact } from "@/features/contacts/queries";
import { displayName } from "@/features/contacts/schema";
import { InvoiceActions } from "@/features/invoices/components/invoice-actions";
import { InvoiceDocument } from "@/features/invoices/components/invoice-document";
import { getInvoice, listInvoiceItems } from "@/features/invoices/queries";
import {
  INVOICE_STATUS_LABELS,
  type ClientSnapshot,
  type InvoiceStatus,
  type IssuerSnapshot,
} from "@/features/invoices/schema";
import { getProject } from "@/features/projects/queries";
import { requireFinanceAccess } from "@/lib/auth";

export const metadata: Metadata = { title: "Invoice" };

const STATUS_TONE: Record<InvoiceStatus, PillTone> = {
  draft: "grey",
  sent: "blue",
  paid: "green",
  cancelled: "red",
};

export default async function InvoicePage(props: PageProps<"/invoices/[id]">) {
  await requireFinanceAccess();

  const { id } = await props.params;
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  const [items, brand, contact, project] = await Promise.all([
    listInvoiceItems(invoice.id),
    getBrand(invoice.brand_id),
    invoice.contact_id ? getContact(invoice.contact_id) : Promise.resolve(null),
    invoice.project_id ? getProject(invoice.project_id) : Promise.resolve(null),
  ]);

  // A draft reflects the company as it is now; anything further along shows the
  // letterhead frozen onto it when it was sent, because that is the document
  // the client is holding.
  const frozen = invoice.issuer_snapshot as IssuerSnapshot | null;

  const issuer: IssuerSnapshot = frozen ?? {
    name: brand?.name ?? "Unknown company",
    legalName: brand?.legal_name ?? null,
    email: brand?.email ?? null,
    phone: brand?.phone ?? null,
    website: brand?.website ?? null,
    address: brand?.address ?? null,
    bankDetails: brand?.bank_details ?? null,
    taxId: brand?.tax_id ?? null,
    logoPath: brand?.logo_path ?? null,
  };

  const frozenClient = invoice.client_snapshot as ClientSnapshot | null;

  const client: ClientSnapshot | null =
    frozenClient ??
    (contact
      ? {
          name: displayName(contact),
          email: contact.email,
          phone: contact.phone,
          address: null,
        }
      : null);

  const logoUrl = await signLogo(issuer.logoPath);

  return (
    <>
      {/* Page chrome, dropped when printing so only the document reaches paper. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-xl font-semibold">{invoice.number}</h1>
          <Pill tone={STATUS_TONE[invoice.status as InvoiceStatus]} dot>
            {INVOICE_STATUS_LABELS[invoice.status as InvoiceStatus]}
          </Pill>
          {invoice.status === "draft" && (
            <span className="text-xs text-muted-foreground">
              Company details are still live and will freeze when you mark it sent
            </span>
          )}
        </div>

        <InvoiceActions
          invoiceId={invoice.id}
          number={invoice.number}
          status={invoice.status as InvoiceStatus}
        />
      </div>

      <div className="rounded-lg border border-border bg-white print:rounded-none print:border-0">
        <InvoiceDocument
          invoice={invoice}
          items={items}
          issuer={issuer}
          client={client}
          logoUrl={logoUrl}
          projectName={project?.name ?? null}
        />
      </div>
    </>
  );
}

import { format } from "date-fns";

import { formatMinor, type Currency } from "@/lib/money";

import type { Invoice, InvoiceItem } from "../queries";
import type { ClientSnapshot, IssuerSnapshot } from "../schema";

interface InvoiceDocumentProps {
  invoice: Invoice;
  items: InvoiceItem[];
  issuer: IssuerSnapshot;
  client: ClientSnapshot | null;
  logoUrl: string | null;
  projectName: string | null;
}

/**
 * The invoice as the client receives it.
 *
 * Deliberately plain: white, black, one rule under the header. It is printed or
 * saved to PDF through the browser, so it avoids anything the print stylesheet
 * would have to undo — no cards, no shadows, no theme colours. `print:` classes
 * drop the page chrome and keep this on the paper.
 */
export function InvoiceDocument({
  invoice,
  items,
  issuer,
  client,
  logoUrl,
  projectName,
}: InvoiceDocumentProps) {
  const currency = invoice.currency as Currency;
  const issued = format(new Date(`${invoice.issue_date}T00:00:00`), "d MMMM yyyy");
  const due = invoice.due_date
    ? format(new Date(`${invoice.due_date}T00:00:00`), "d MMMM yyyy")
    : null;

  return (
    <article className="mx-auto w-full max-w-3xl bg-white p-10 text-[13px] leading-relaxed text-black print:max-w-none print:p-0">
      <header className="flex items-start justify-between gap-8 border-b border-neutral-300 pb-6">
        <div className="min-w-0">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="mb-3 h-12 w-auto object-contain" />
          )}
          <p className="text-base font-semibold">{issuer.legalName || issuer.name}</p>
          {issuer.address && (
            <p className="mt-1 whitespace-pre-line text-neutral-600">{issuer.address}</p>
          )}
          <p className="mt-1 text-neutral-600">
            {[issuer.email, issuer.phone, issuer.website?.replace(/^https?:\/\//, "")]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {issuer.taxId && <p className="mt-1 text-neutral-600">{issuer.taxId}</p>}
        </div>

        <div className="shrink-0 text-right">
          <h1 className="text-2xl font-bold tracking-tight">INVOICE</h1>
          <p className="mt-1 font-mono text-sm">{invoice.number}</p>
          <dl className="mt-3 space-y-0.5 text-xs text-neutral-600">
            <div className="flex justify-end gap-3">
              <dt>Issued</dt>
              <dd className="text-black">{issued}</dd>
            </div>
            {due && (
              <div className="flex justify-end gap-3">
                <dt>Due</dt>
                <dd className="text-black">{due}</dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      <section className="mt-6 flex flex-wrap justify-between gap-6">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Bill to</p>
          {client ? (
            <>
              <p className="mt-1 font-medium">{client.name}</p>
              {client.address && (
                <p className="whitespace-pre-line text-neutral-600">{client.address}</p>
              )}
              <p className="text-neutral-600">
                {[client.email, client.phone].filter(Boolean).join(" · ")}
              </p>
            </>
          ) : (
            <p className="mt-1 text-neutral-500">No client on this invoice</p>
          )}
        </div>

        {projectName && (
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Project</p>
            <p className="mt-1">{projectName}</p>
          </div>
        )}
      </section>

      <table className="mt-8 w-full border-collapse">
        <thead>
          <tr className="border-b border-neutral-300 text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-2 text-left font-normal">Description</th>
            <th className="w-20 py-2 text-right font-normal">Qty</th>
            <th className="w-32 py-2 text-right font-normal">Rate</th>
            <th className="w-32 py-2 text-right font-normal">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-neutral-200">
              <td className="py-2 pr-4 align-top">{item.description}</td>
              <td className="py-2 text-right align-top tabular-nums">
                {/* 1.000 reads as a mistake; 1 does not. */}
                {Number(item.quantity).toString()}
              </td>
              <td className="py-2 text-right align-top tabular-nums">
                {formatMinor(Number(item.unit_amount_minor), currency)}
              </td>
              <td className="py-2 text-right align-top tabular-nums">
                {formatMinor(Number(item.amount_minor), currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <dl className="w-full max-w-[16rem] space-y-1">
          <div className="flex justify-between">
            <dt className="text-neutral-600">Subtotal</dt>
            <dd className="tabular-nums">
              {formatMinor(Number(invoice.subtotal_minor), currency)}
            </dd>
          </div>

          {Number(invoice.tax_rate) > 0 && (
            <div className="flex justify-between">
              <dt className="text-neutral-600">
                {invoice.tax_label || "Tax"} {Number(invoice.tax_rate)}%
              </dt>
              <dd className="tabular-nums">
                {formatMinor(Number(invoice.tax_minor), currency)}
              </dd>
            </div>
          )}

          <div className="flex justify-between border-t border-neutral-300 pt-1 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">
              {formatMinor(Number(invoice.total_minor), currency)}
            </dd>
          </div>
        </dl>
      </div>

      {(issuer.bankDetails || invoice.notes || invoice.terms) && (
        <footer className="mt-10 grid gap-6 border-t border-neutral-300 pt-6 sm:grid-cols-2">
          {issuer.bankDetails && (
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-500">Payment</p>
              <p className="mt-1 whitespace-pre-line text-neutral-700">
                {issuer.bankDetails}
              </p>
            </div>
          )}
          <div className="space-y-4">
            {invoice.notes && (
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-500">Notes</p>
                <p className="mt-1 whitespace-pre-line text-neutral-700">{invoice.notes}</p>
              </div>
            )}
            {invoice.terms && (
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-500">Terms</p>
                <p className="mt-1 whitespace-pre-line text-neutral-700">{invoice.terms}</p>
              </div>
            )}
          </div>
        </footer>
      )}
    </article>
  );
}

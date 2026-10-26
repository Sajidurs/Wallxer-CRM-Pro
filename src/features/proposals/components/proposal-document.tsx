import { format } from "date-fns";

import { formatMinor, type Currency } from "@/lib/money";

import type { Proposal, ProposalItem } from "../queries";
import {
  PROPOSAL_SECTIONS,
  type ClientSnapshot,
  type IssuerSnapshot,
} from "../schema";

interface ProposalDocumentProps {
  proposal: Proposal;
  items: ProposalItem[];
  issuer: IssuerSnapshot;
  client: ClientSnapshot | null;
  logoUrl: string | null;
  projectName: string | null;
}

/**
 * The proposal as the client receives it.
 *
 * Deliberately plain, like the invoice: white, black, one rule under the
 * header. It is printed or saved to PDF through the browser, so it avoids
 * anything the print stylesheet would then have to undo — no cards, no
 * shadows, no theme colours.
 *
 * A proposal is read rather than scanned, so this is wider-set and more
 * generous in its spacing than the invoice, and the sections break cleanly:
 * `break-inside-avoid` keeps a heading from landing alone at the foot of a
 * page with its paragraph overleaf.
 */
export function ProposalDocument({
  proposal,
  items,
  issuer,
  client,
  logoUrl,
  projectName,
}: ProposalDocumentProps) {
  const currency = proposal.currency as Currency;
  const issued = format(new Date(`${proposal.issue_date}T00:00:00`), "d MMMM yyyy");
  const validUntil = proposal.valid_until
    ? format(new Date(`${proposal.valid_until}T00:00:00`), "d MMMM yyyy")
    : null;

  // A section with nothing in it is not a section. This is the whole reason
  // fixed headings cost nothing when they are not wanted.
  const sections = PROPOSAL_SECTIONS.map((section) => ({
    ...section,
    body: proposal[section.key],
  })).filter((section) => Boolean(section.body?.trim()));

  const hasPricing = items.length > 0;

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
        </div>

        <div className="shrink-0 text-right">
          <h1 className="text-2xl font-bold tracking-tight">PROPOSAL</h1>
          <p className="mt-1 font-mono text-sm">{proposal.number}</p>
          <dl className="mt-3 space-y-0.5 text-xs text-neutral-600">
            <div className="flex justify-end gap-3">
              <dt>Date</dt>
              <dd className="text-black">{issued}</dd>
            </div>
            {validUntil && (
              <div className="flex justify-end gap-3">
                <dt>Valid until</dt>
                <dd className="text-black">{validUntil}</dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      <section className="mt-6 flex flex-wrap justify-between gap-6">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Prepared for</p>
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
            <p className="mt-1 text-neutral-500">No client on this proposal</p>
          )}
        </div>

        {projectName && (
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Project</p>
            <p className="mt-1">{projectName}</p>
          </div>
        )}
      </section>

      <h2 className="mt-8 text-xl font-semibold tracking-tight">{proposal.title}</h2>

      {sections.map((section) => (
        <section key={section.key} className="mt-6 break-inside-avoid">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {section.label}
          </h3>
          <p className="mt-1.5 whitespace-pre-line text-neutral-800">{section.body}</p>
        </section>
      ))}

      {hasPricing && (
        <section className="mt-8 break-inside-avoid">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Pricing
          </h3>

          <table className="mt-2 w-full border-collapse">
            <thead>
              <tr className="border-b border-neutral-300 text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 text-left font-normal">Item</th>
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
                  {formatMinor(Number(proposal.subtotal_minor), currency)}
                </dd>
              </div>

              {Number(proposal.tax_rate) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-neutral-600">
                    {proposal.tax_label || "Tax"} {Number(proposal.tax_rate)}%
                  </dt>
                  <dd className="tabular-nums">
                    {formatMinor(Number(proposal.tax_minor), currency)}
                  </dd>
                </div>
              )}

              <div className="flex justify-between border-t border-neutral-300 pt-1 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">
                  {formatMinor(Number(proposal.total_minor), currency)}
                </dd>
              </div>
            </dl>
          </div>
        </section>
      )}

      {validUntil && (
        <p className="mt-8 border-t border-neutral-300 pt-4 text-xs text-neutral-500">
          This proposal is valid until {validUntil}. To go ahead, reply to this
          document and we will raise the invoice and start on the dates above.
        </p>
      )}
    </article>
  );
}

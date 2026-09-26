import { Check, ImageIcon, Minus } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Pill } from "@/components/common/pill";
import { Button } from "@/components/ui/button";
import { BrandDialog } from "@/features/brands/components/brand-dialog";
import { signLogos } from "@/features/brands/logos";
import { listBrands } from "@/features/brands/queries";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Companies" };

/**
 * Companies, which the rest of the app still calls brands.
 *
 * They began as a tag — a name and a colour on a contact — and an invoice
 * needs the letterhead behind that tag. Rather than inventing a second concept
 * that would sit alongside and drift from it, the brand grew the address, the
 * bank block and the logo.
 */
export default async function BrandsPage() {
  await requireRole("admin");

  const brands = await listBrands();
  const logos = await signLogos(brands.map((b) => b.logo_path));

  const complete = (b: (typeof brands)[number]) =>
    Boolean(b.address && b.email && b.bank_details);

  return (
    <>
      <PageHeader
        title="Companies"
        description="The businesses you invoice from, and the details printed on each invoice."
        actions={<BrandDialog />}
      />

      <div className="space-y-3">
        {brands.map((brand) => {
          const logoUrl = brand.logo_path ? (logos.get(brand.logo_path) ?? null) : null;

          return (
            <div
              key={brand.id}
              className="flex items-start gap-4 rounded-lg border border-border bg-card p-4"
            >
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="size-full object-contain p-1" />
                ) : (
                  <ImageIcon className="size-5 text-muted-foreground/50" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: brand.color }}
                    aria-hidden
                  />
                  <span className="font-medium">{brand.name}</span>
                  {brand.invoice_prefix && (
                    <Pill tone="grey">{brand.invoice_prefix}-0001</Pill>
                  )}
                  {!brand.is_active && <Pill tone="grey" dot>Inactive</Pill>}
                  {/* An invoice with no address or bank block is not one anyone
                      can pay, so the gap is worth naming here rather than
                      discovering at the moment of sending. */}
                  {brand.is_active && !complete(brand) && (
                    <Pill tone="amber" dot>Details incomplete</Pill>
                  )}
                </div>

                <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <Row label="Email" value={brand.email} />
                  <Row label="Phone" value={brand.phone} />
                  <Row label="Website" value={brand.website} />
                  <Row label="Tax / BIN" value={brand.tax_id} />
                  <Row label="Address" value={brand.address?.split("\n")[0] ?? null} />
                  <Row label="Bank" value={brand.bank_details?.split("\n")[0] ?? null} />
                </dl>
              </div>

              <BrandDialog
                brand={brand}
                logoUrl={logoUrl}
                trigger={
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                }
              />
            </div>
          );
        })}

        {brands.length === 0 && (
          <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            No companies yet. Add the first one to start invoicing.
          </p>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0">{label}</dt>
      <dd className="min-w-0 truncate text-foreground/80">
        {value ? (
          <span className="inline-flex items-center gap-1">
            <Check className="size-3 text-[#6FA368]" />
            {value}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground/60">
            <Minus className="size-3" />
            Not set
          </span>
        )}
      </dd>
    </div>
  );
}

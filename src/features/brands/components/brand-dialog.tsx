"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { createBrand, updateBrand } from "../actions";
import type { Brand } from "../queries";
import { brandSchema, type BrandInput } from "../schema";

import { LogoUpload } from "./logo-upload";

interface BrandDialogProps {
  /** Absent when adding. */
  brand?: Brand;
  logoUrl?: string | null;
  trigger?: React.ReactNode;
}

const SWATCHES = [
  "#2563eb", "#16a34a", "#ea580c", "#7c3aed",
  "#0891b2", "#db2777", "#ca8a04", "#64748b",
];

/**
 * One dialog for adding and for editing.
 *
 * Everything under the name is the invoice letterhead, which is why the form is
 * this long: an invoice with no address or bank details is not an invoice
 * anybody can pay.
 */
export function BrandDialog({ brand, logoUrl, trigger }: BrandDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<BrandInput>({
    resolver: zodResolver(brandSchema),
    defaultValues: {
      name: brand?.name ?? "",
      color: brand?.color ?? SWATCHES[0],
      legalName: brand?.legal_name ?? "",
      email: brand?.email ?? "",
      phone: brand?.phone ?? "",
      website: brand?.website ?? "",
      address: brand?.address ?? "",
      bankDetails: brand?.bank_details ?? "",
      taxId: brand?.tax_id ?? "",
      invoicePrefix: brand?.invoice_prefix ?? "",
      isActive: brand?.is_active ?? true,
    },
  });

  function onSubmit(values: BrandInput) {
    startTransition(async () => {
      const result = brand
        ? await updateBrand({ ...values, id: brand.id })
        : await createBrand(values);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(brand ? "Company updated." : "Company added.");
      setOpen(false);
      if (!brand) reset();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus />
            New company
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{brand ? brand.name : "New company"}</DialogTitle>
          <DialogDescription>
            These details print on every invoice issued from this company.
          </DialogDescription>
        </DialogHeader>

        {brand && (
          <div className="border-b border-border pb-5">
            <LogoUpload brandId={brand.id} currentUrl={logoUrl ?? null} />
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" error={errors.name?.message}>
              <Input {...register("name")} placeholder="Wallxer" />
            </Field>

            <Field
              label="Legal name"
              hint="Only if it differs from the name above"
              error={errors.legalName?.message}
            >
              <Input {...register("legalName")} placeholder="Wallxer Ltd." />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Email" error={errors.email?.message}>
              <Input {...register("email")} placeholder="billing@wallxer.com" />
            </Field>
            <Field label="Phone" error={errors.phone?.message}>
              <Input {...register("phone")} placeholder="+880 1XXX-XXXXXX" />
            </Field>
            <Field label="Website" error={errors.website?.message}>
              <Input {...register("website")} placeholder="wallxer.com" />
            </Field>
          </div>

          <Field label="Address" error={errors.address?.message}>
            <Textarea {...register("address")} rows={3} placeholder={"House 12, Road 5\nDhaka 1213\nBangladesh"} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Bank details"
              hint="Printed under Payment on the invoice"
              error={errors.bankDetails?.message}
            >
              <Textarea
                {...register("bankDetails")}
                rows={4}
                placeholder={"Bank: City Bank\nAccount: 1234567890\nBranch: Gulshan\nSWIFT: CIBLBDDH"}
              />
            </Field>

            <div className="space-y-5">
              <Field label="Tax / BIN" error={errors.taxId?.message}>
                <Input {...register("taxId")} placeholder="BIN 000000000-0000" />
              </Field>

              <Field
                label="Invoice prefix"
                hint="Numbers count up per company, as WLX-0001"
                error={errors.invoicePrefix?.message}
              >
                <Input {...register("invoicePrefix")} placeholder="WLX" className="uppercase" />
              </Field>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="color"
              render={({ field }) => (
                <Field label="Colour" error={errors.color?.message}>
                  <div className="flex flex-wrap gap-1.5">
                    {SWATCHES.map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        aria-label={swatch}
                        onClick={() => field.onChange(swatch)}
                        style={{ backgroundColor: swatch }}
                        className={
                          "size-7 rounded-full transition-transform " +
                          (field.value === swatch
                            ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                            : "hover:scale-110")
                        }
                      />
                    ))}
                  </div>
                </Field>
              )}
            />

            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Field
                  label="Status"
                  hint="An inactive company stays on its old invoices but disappears from every picker"
                >
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => field.onChange(!field.value)}
                    className="w-full justify-start"
                  >
                    <span
                      className={
                        "size-2 rounded-full " +
                        (field.value ? "bg-[#6FA368]" : "bg-[#9B9A97]")
                      }
                    />
                    {field.value ? "Active" : "Inactive"}
                  </Button>
                </Field>
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving" : brand ? "Save changes" : "Add company"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

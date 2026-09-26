"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CURRENCIES,
  CURRENCY_LABELS,
  formatMinor,
  parseAmountToMinor,
  type Currency,
} from "@/lib/money";

import { createInvoice, updateInvoice } from "../actions";
import { invoiceSchema, type InvoiceInput } from "../schema";

interface Option {
  id: string;
  name: string;
}

interface InvoiceFormProps {
  companies: Option[];
  clients: Option[];
  projects: Option[];
  invoiceId?: string;
  defaultValues?: Partial<InvoiceInput>;
}

const NONE = "__none__";

export function InvoiceForm({
  companies,
  clients,
  projects,
  invoiceId,
  defaultValues,
}: InvoiceFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<InvoiceInput>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      brandId: companies[0]?.id ?? "",
      currency: "BDT",
      issueDate: new Date().toISOString().slice(0, 10),
      taxRate: "0",
      items: [{ description: "", quantity: "1", unitAmount: "" }],
      ...defaultValues,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  // Live totals, computed the same way the database will: minor units, and the
  // line total rounded before it is summed.
  const items = useWatch({ control, name: "items" }) ?? [];
  const taxRate = useWatch({ control, name: "taxRate" });
  const currency = (useWatch({ control, name: "currency" }) ?? "BDT") as Currency;

  const subtotal = items.reduce((sum, item) => {
    const unit = parseAmountToMinor(String(item?.unitAmount ?? "")) ?? 0;
    const qty = Number(item?.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) return sum;
    return sum + Math.round(qty * unit);
  }, 0);

  const rate = Number(taxRate ?? 0);
  const tax = Number.isFinite(rate) ? Math.round((subtotal * rate) / 100) : 0;

  function onSubmit(values: InvoiceInput) {
    startTransition(async () => {
      const result = invoiceId
        ? await updateInvoice({ id: invoiceId, values })
        : await createInvoice(values);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(invoiceId ? "Invoice saved." : `Invoice ${"number" in result.data ? result.data.number : ""} created.`);
      router.push(`/invoices/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* First, because it decides the letterhead and the number. */}
        <Controller
          control={control}
          name="brandId"
          render={({ field }) => (
            <div className="space-y-2">
              <Label>Issued by</Label>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Which company?" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.brandId && (
                <p className="text-sm text-destructive">{errors.brandId.message}</p>
              )}
            </div>
          )}
        />

        <Picker
          label="Bill to"
          control={control}
          name="contactId"
          options={clients}
          placeholder="No client"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Controller
          control={control}
          name="currency"
          render={({ field }) => (
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CURRENCY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        />

        <div className="space-y-2">
          <Label htmlFor="issueDate">Issue date</Label>
          <Input id="issueDate" type="date" {...register("issueDate")} />
          {errors.issueDate && (
            <p className="text-sm text-destructive">{errors.issueDate.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="dueDate">Due date</Label>
          <Input id="dueDate" type="date" {...register("dueDate")} />
          {errors.dueDate && (
            <p className="text-sm text-destructive">{errors.dueDate.message}</p>
          )}
        </div>

        <Picker
          label="Project"
          control={control}
          name="projectId"
          options={projects}
          placeholder="None"
        />
      </div>

      {/* Lines */}
      <div className="space-y-2">
        <Label>Lines</Label>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="border-b border-r border-border px-3 py-2 text-left font-normal">
                  Description
                </th>
                <th className="w-24 border-b border-r border-border px-3 py-2 text-right font-normal">
                  Qty
                </th>
                <th className="w-36 border-b border-r border-border px-3 py-2 text-right font-normal">
                  Rate
                </th>
                <th className="w-32 border-b border-r border-border px-3 py-2 text-right font-normal">
                  Amount
                </th>
                <th className="w-10 border-b border-border" />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => {
                const unit = parseAmountToMinor(String(items[index]?.unitAmount ?? "")) ?? 0;
                const qty = Number(items[index]?.quantity ?? 0);
                const amount = Number.isFinite(qty) && qty > 0 ? Math.round(qty * unit) : 0;

                return (
                  <tr key={field.id}>
                    <td className="border-b border-r border-border p-1">
                      <Input
                        {...register(`items.${index}.description`)}
                        placeholder="Website design"
                        className="border-0 shadow-none focus-visible:ring-0"
                      />
                    </td>
                    <td className="border-b border-r border-border p-1">
                      <Input
                        {...register(`items.${index}.quantity`)}
                        inputMode="decimal"
                        className="border-0 text-right shadow-none focus-visible:ring-0"
                      />
                    </td>
                    <td className="border-b border-r border-border p-1">
                      <Input
                        {...register(`items.${index}.unitAmount`)}
                        inputMode="decimal"
                        placeholder="0.00"
                        className="border-0 text-right shadow-none focus-visible:ring-0"
                      />
                    </td>
                    <td className="border-b border-r border-border px-3 py-2 text-right tabular-nums">
                      {formatMinor(amount, currency)}
                    </td>
                    <td className="border-b border-border px-1 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground"
                        aria-label={`Remove line ${index + 1}`}
                        disabled={fields.length === 1}
                        onClick={() => remove(index)}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {errors.items?.message && (
          <p className="text-sm text-destructive">{errors.items.message}</p>
        )}
        {Array.isArray(errors.items) &&
          errors.items.find((e) => e?.description || e?.quantity || e?.unitAmount) && (
            <p className="text-sm text-destructive">
              Every line needs a description, a quantity above zero and a rate.
            </p>
          )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ description: "", quantity: "1", unitAmount: "" })}
        >
          <Plus />
          Add a line
        </Button>
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <dl className="w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{formatMinor(subtotal, currency)}</dd>
          </div>

          <div className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <Input
                {...register("taxLabel")}
                placeholder="VAT"
                className="h-7 w-20 px-2 text-xs"
              />
              <Input
                {...register("taxRate")}
                inputMode="decimal"
                className="h-7 w-14 px-2 text-right text-xs"
              />
              <span className="text-xs">%</span>
            </dt>
            <dd className="tabular-nums">{formatMinor(tax, currency)}</dd>
          </div>
          {errors.taxRate && (
            <p className="text-right text-sm text-destructive">{errors.taxRate.message}</p>
          )}

          <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatMinor(subtotal + tax, currency)}</dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="notes">Note to the client</Label>
          <Textarea id="notes" rows={3} {...register("notes")} placeholder="Thanks for your business." />
        </div>
        <div className="space-y-2">
          <Label htmlFor="terms">Terms</Label>
          <Textarea id="terms" rows={3} {...register("terms")} placeholder="Payment due within 14 days." />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending || companies.length === 0}>
          {isPending ? "Saving" : invoiceId ? "Save changes" : "Create invoice"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

type NullableIdField = "contactId" | "projectId";

function Picker({
  label,
  control,
  name,
  options,
  placeholder,
}: {
  label: string;
  control: ReturnType<typeof useForm<InvoiceInput>>["control"];
  name: NullableIdField;
  options: Option[];
  placeholder: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="space-y-2">
          <Label>{label}</Label>
          <Select
            value={field.value ?? NONE}
            onValueChange={(v) => field.onChange(v === NONE ? null : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{placeholder}</SelectItem>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    />
  );
}

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

import { createProposal, updateProposal } from "../actions";
import {
  PROPOSAL_SECTIONS,
  proposalSchema,
  type ProposalInput,
} from "../schema";

interface Option {
  id: string;
  name: string;
}

interface ProposalFormProps {
  companies: Option[];
  clients: Option[];
  projects: Option[];
  proposalId?: string;
  defaultValues?: Partial<ProposalInput>;
}

const NONE = "__none__";

export function ProposalForm({
  companies,
  clients,
  projects,
  proposalId,
  defaultValues,
}: ProposalFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ProposalInput>({
    resolver: zodResolver(proposalSchema),
    defaultValues: {
      brandId: companies[0]?.id ?? "",
      contactId: "",
      title: "",
      currency: "BDT",
      issueDate: new Date().toISOString().slice(0, 10),
      taxRate: "0",
      items: [],
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

  function onSubmit(values: ProposalInput) {
    startTransition(async () => {
      const result = proposalId
        ? await updateProposal({ id: proposalId, values })
        : await createProposal(values);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(proposalId ? "Proposal saved." : "Proposal created.");
      router.push(`/proposals/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8" noValidate>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            {...register("title")}
            placeholder="Website redesign and launch"
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* First, because it decides the letterhead and the number. */}
          <Controller
            control={control}
            name="brandId"
            render={({ field }) => (
              <div className="space-y-2">
                <Label>From</Label>
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

          {/* Required here, unlike an invoice: a proposal is written to
              somebody, and the email button needs their address. */}
          <Controller
            control={control}
            name="contactId"
            render={({ field }) => (
              <div className="space-y-2">
                <Label>To</Label>
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Which client?" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.contactId && (
                  <p className="text-sm text-destructive">{errors.contactId.message}</p>
                )}
              </div>
            )}
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
            <Label htmlFor="issueDate">Date</Label>
            <Input id="issueDate" type="date" {...register("issueDate")} />
            {errors.issueDate && (
              <p className="text-sm text-destructive">{errors.issueDate.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="validUntil">Valid until</Label>
            <Input id="validUntil" type="date" {...register("validUntil")} />
            {errors.validUntil && (
              <p className="text-sm text-destructive">{errors.validUntil.message}</p>
            )}
          </div>

          <Controller
            control={control}
            name="projectId"
            render={({ field }) => (
              <div className="space-y-2">
                <Label>Project</Label>
                <Select
                  value={field.value ?? NONE}
                  onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {projects.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />
        </div>
      </div>

      {/* The body. Every section optional; a blank one does not print. */}
      <div className="space-y-5">
        <div>
          <h2 className="text-sm font-medium">The proposal</h2>
          <p className="text-xs text-muted-foreground">
            Fill in what is useful. Anything left blank is left off the document.
          </p>
        </div>

        {PROPOSAL_SECTIONS.map((section) => (
          <div key={section.key} className="space-y-2">
            <Label htmlFor={section.key}>{section.label}</Label>
            <Textarea
              id={section.key}
              rows={section.rows}
              {...register(section.key)}
              placeholder={section.hint}
            />
            {errors[section.key] && (
              <p className="text-sm text-destructive">{errors[section.key]?.message}</p>
            )}
          </div>
        ))}
      </div>

      {/* Pricing */}
      <div className="space-y-2">
        <div>
          <h2 className="text-sm font-medium">Pricing</h2>
          <p className="text-xs text-muted-foreground">
            Optional. With no lines, the pricing table is left off entirely.
          </p>
        </div>

        {fields.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="border-b border-r border-border px-3 py-2 text-left font-normal">
                    Item
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
                  const unit =
                    parseAmountToMinor(String(items[index]?.unitAmount ?? "")) ?? 0;
                  const qty = Number(items[index]?.quantity ?? 0);
                  const amount =
                    Number.isFinite(qty) && qty > 0 ? Math.round(qty * unit) : 0;

                  return (
                    <tr key={field.id}>
                      <td className="border-b border-r border-border p-1">
                        <Input
                          {...register(`items.${index}.description`)}
                          placeholder="Design and build, 8 pages"
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

      {fields.length > 0 && (
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
              <p className="text-right text-sm text-destructive">
                {errors.taxRate.message}
              </p>
            )}

            <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMinor(subtotal + tax, currency)}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending || companies.length === 0}>
          {isPending ? "Saving" : proposalId ? "Save changes" : "Create proposal"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

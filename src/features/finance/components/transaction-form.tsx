"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, type Control } from "react-hook-form";
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
import { CURRENCY_SYMBOL } from "@/lib/money";
import { cn } from "@/lib/utils";

import { createTransaction, updateTransaction } from "../actions";
import type { TransactionCategory } from "../queries";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  TRANSACTION_KINDS,
  TRANSACTION_KIND_LABELS,
  transactionSchema,
  type TransactionInput,
  type TransactionKind,
} from "../schema";

interface Option {
  id: string;
  name: string;
}

interface TransactionFormProps {
  categories: TransactionCategory[];
  brands: Option[];
  projects: Option[];
  contacts: Option[];
  /** Present when editing. */
  transactionId?: string;
  defaultValues?: Partial<TransactionInput>;
}

const NONE = "__none__";

export function TransactionForm({
  categories,
  brands,
  projects,
  contacts,
  transactionId,
  defaultValues,
}: TransactionFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [kind, setKind] = useState<TransactionKind>(
    (defaultValues?.kind as TransactionKind) ?? "expense",
  );

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<TransactionInput>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      kind: "expense",
      paymentMethod: "bank_transfer",
      occurredOn: new Date().toISOString().slice(0, 10),
      ...defaultValues,
    },
  });

  // Categories belong to one kind or the other, so the list follows the toggle.
  const visibleCategories = categories.filter((c) => c.kind === kind);

  function onSubmit(values: TransactionInput) {
    startTransition(async () => {
      const result = transactionId
        ? await updateTransaction({ ...values, id: transactionId })
        : await createTransaction(values);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(transactionId ? "Transaction updated." : "Transaction recorded.");
      router.push("/finance/transactions");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {/* Kind first: it decides which categories exist, and income and expense
          are different enough that choosing afterwards invites mistakes. */}
      <div className="space-y-2">
        <Label>Type</Label>
        <div className="flex gap-2">
          {TRANSACTION_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setKind(option);
                setValue("kind", option);
                setValue("categoryId", null);
              }}
              className={cn(
                "flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                kind === option
                  ? "border-foreground/20 bg-accent"
                  : "border-border hover:bg-accent/50",
              )}
              aria-pressed={kind === option}
            >
              {TRANSACTION_KIND_LABELS[option]}
            </button>
          ))}
        </div>
        <input type="hidden" {...register("kind")} value={kind} readOnly />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {CURRENCY_SYMBOL}
            </span>
            <Input
              id="amount"
              inputMode="decimal"
              placeholder="2500"
              className="pl-7"
              {...register("amount")}
            />
          </div>
          {errors.amount && (
            <p className="text-sm text-destructive">{errors.amount.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="occurredOn">Date</Label>
          <Input id="occurredOn" type="date" {...register("occurredOn")} />
          {errors.occurredOn && (
            <p className="text-sm text-destructive">{errors.occurredOn.message}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Picker
          label="Category"
          control={control}
          name="categoryId"
          options={visibleCategories.map((c) => ({ id: c.id, name: c.name }))}
          placeholder="Uncategorised"
        />

        <Controller
          control={control}
          name="paymentMethod"
          render={({ field }) => (
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select
                value={field.value ?? "bank_transfer"}
                onValueChange={field.onChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Picker
          label="Project"
          control={control}
          name="projectId"
          options={projects}
          placeholder="None"
        />
        <Picker
          label="Client"
          control={control}
          name="contactId"
          options={contacts}
          placeholder="None"
        />
        <Picker
          label="Brand"
          control={control}
          name="brandId"
          options={brands}
          placeholder="None"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="reference">Reference</Label>
        <Input
          id="reference"
          placeholder="Invoice number, bank reference, anything to find it by"
          {...register("reference")}
        />
        {errors.reference && (
          <p className="text-sm text-destructive">{errors.reference.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Note</Label>
        <Textarea id="description" rows={3} {...register("description")} />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? "Saving"
            : transactionId
              ? "Save changes"
              : `Record ${TRANSACTION_KIND_LABELS[kind].toLowerCase()}`}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** The four optional foreign keys, all of which clear to null rather than "". */
type NullableIdField = "categoryId" | "projectId" | "contactId" | "brandId";

function Picker({
  label,
  control,
  name,
  options,
  placeholder,
}: {
  label: string;
  control: Control<TransactionInput>;
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

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { CURRENCIES, CURRENCY_LABELS } from "@/lib/money";
import { cn } from "@/lib/utils";

import { createRenewal, updateRenewal } from "../actions";
import {
  CATEGORY_LABELS,
  CYCLE_LABELS,
  RENEWAL_CATEGORIES,
  RENEWAL_CYCLES,
  RENEWAL_STATUSES,
  STATUS_LABELS,
  renewalSchema,
  type RenewalInput,
} from "../schema";

interface Option {
  id: string;
  name: string;
}

interface RenewalFormProps {
  clients: Option[];
  projects: Option[];
  companies: Option[];
  renewalId?: string;
  defaultValues?: Partial<RenewalInput>;
}

const NONE = "__none__";

export function RenewalForm({
  clients,
  projects,
  companies,
  renewalId,
  defaultValues,
}: RenewalFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RenewalInput>({
    resolver: zodResolver(renewalSchema),
    defaultValues: {
      name: "",
      category: "hosting",
      status: "active",
      cycle: "yearly",
      currency: "BDT",
      startedOn: new Date().toISOString().slice(0, 10),
      nextRenewalOn: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
        .toISOString()
        .slice(0, 10),
      autoRenew: true,
      reminderDays: "14",
      ...defaultValues,
    },
  });

  function onSubmit(values: RenewalInput) {
    startTransition(async () => {
      const result = renewalId
        ? await updateRenewal({ id: renewalId, values })
        : await createRenewal(values);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(renewalId ? "Renewal updated." : "Renewal added.");
      router.push("/renewals");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={errors.name?.message}>
          <Input {...register("name")} placeholder="Elementor Pro" autoFocus />
        </Field>

        <Field label="Vendor" hint="Who you buy it from" error={errors.vendor?.message}>
          <Input {...register("vendor")} placeholder="Elementor" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Picker
          label="Category"
          control={control}
          name="category"
          options={RENEWAL_CATEGORIES.map((c) => ({ id: c, name: CATEGORY_LABELS[c] }))}
        />
        <Picker
          label="Billing cycle"
          control={control}
          name="cycle"
          options={RENEWAL_CYCLES.map((c) => ({ id: c, name: CYCLE_LABELS[c] }))}
        />
        <Picker
          label="Status"
          control={control}
          name="status"
          options={RENEWAL_STATUSES.map((s) => ({ id: s, name: STATUS_LABELS[s] }))}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Started" error={errors.startedOn?.message}>
          <Input type="date" {...register("startedOn")} />
        </Field>
        <Field label="Next renewal" error={errors.nextRenewalOn?.message}>
          <Input type="date" {...register("nextRenewalOn")} />
        </Field>
        <Field
          label="Last renewed"
          hint="Leave blank if it has never been renewed"
          error={errors.lastRenewedOn?.message}
        >
          <Input type="date" {...register("lastRenewedOn")} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <NullablePicker
          label="Client"
          control={control}
          name="contactId"
          options={clients}
          placeholder="No client"
        />
        <NullablePicker
          label="Project"
          control={control}
          name="projectId"
          options={projects}
          placeholder="None"
        />
        <NullablePicker
          label="Sold by"
          control={control}
          name="brandId"
          options={companies}
          placeholder="None"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Picker
          label="Currency"
          control={control}
          name="currency"
          options={CURRENCIES.map((c) => ({ id: c, name: CURRENCY_LABELS[c] }))}
        />
        <Field
          label="Price to client"
          hint="Per cycle, not per year"
          error={errors.price?.message}
        >
          <Input {...register("price")} inputMode="decimal" placeholder="0.00" />
        </Field>
        <Field
          label="Your cost"
          hint="What you pay the vendor"
          error={errors.cost?.message}
        >
          <Input {...register("cost")} inputMode="decimal" placeholder="0.00" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Controller
          control={control}
          name="autoRenew"
          render={({ field }) => (
            <Field label="Renewal" hint="Whether the vendor charges automatically">
              <Button
                type="button"
                variant="outline"
                onClick={() => field.onChange(!field.value)}
                className="w-full justify-start"
              >
                <span
                  className={cn(
                    "size-2 rounded-full",
                    field.value ? "bg-[#6FA368]" : "bg-[#D29A4E]",
                  )}
                />
                {field.value ? "Automatic" : "Manual — must be paid by hand"}
              </Button>
            </Field>
          )}
        />

        <Field
          label="Remind me, days before"
          error={errors.reminderDays?.message}
        >
          <Input {...register("reminderDays")} type="number" min={0} max={365} />
        </Field>

        <Field label="Login URL" error={errors.loginUrl?.message}>
          <Input {...register("loginUrl")} placeholder="https://" />
        </Field>
      </div>

      <Field label="Notes" error={errors.notes?.message}>
        <Textarea {...register("notes")} rows={3} />
      </Field>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving" : renewalId ? "Save changes" : "Add renewal"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

type Control = ReturnType<typeof useForm<RenewalInput>>["control"];

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

/** A required enum picker. */
function Picker({
  label,
  control,
  name,
  options,
}: {
  label: string;
  control: Control;
  name: "category" | "cycle" | "status" | "currency";
  options: Option[];
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field label={label}>
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    />
  );
}

/** An optional foreign key, which clears to null rather than "". */
function NullablePicker({
  label,
  control,
  name,
  options,
  placeholder,
}: {
  label: string;
  control: Control;
  name: "contactId" | "projectId" | "brandId";
  options: Option[];
  placeholder: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field label={label}>
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
        </Field>
      )}
    />
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { createDeal, updateDeal } from "../actions";
import type { PipelineStage } from "../queries";
import { dealSchema, type DealInput, type DealValues } from "../schema";

const NONE = "__none__";

interface Option {
  id: string;
  name: string;
}

interface DealFormProps {
  dealId?: string;
  defaults: DealInput;
  contacts: Option[];
  brands: Option[];
  owners: Option[];
  pipelines: Option[];
  stages: PipelineStage[];
  showValues: boolean;
}

export function DealForm({
  dealId,
  defaults,
  contacts,
  brands,
  owners,
  pipelines,
  stages,
  showValues,
}: DealFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DealInput, unknown, DealValues>({
    resolver: zodResolver(dealSchema),
    defaultValues: defaults,
  });

  async function onSubmit(values: DealValues) {
    setFormError(null);

    const result = dealId
      ? await updateDeal({ id: dealId, values })
      : await createDeal(values);

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) {
            setError(name as keyof DealInput, { message: messages[0] });
          }
        }
      }
      setFormError(result.error);
      return;
    }

    toast.success(dealId ? "Deal updated." : "Deal created.");
    router.replace(`/pipeline/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>The deal</CardTitle>
          <CardDescription>
            Every deal belongs to a contact. Create the contact first if they are
            not in the list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input
                id="title"
                autoFocus
                placeholder="Website redesign"
                aria-invalid={!!errors.title}
                {...register("title")}
              />
              <FieldError errors={[errors.title]} />
            </Field>

            <Controller
              control={control}
              name="contactId"
              render={({ field }) => (
                <Field data-invalid={!!errors.contactId}>
                  <FieldLabel htmlFor="contactId">Contact</FieldLabel>
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger id="contactId" aria-invalid={!!errors.contactId}>
                      <SelectValue placeholder="Pick a contact" />
                    </SelectTrigger>
                    <SelectContent>
                      {contacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {contacts.length === 0 && (
                    <FieldDescription>
                      No contacts yet.{" "}
                      <Link href="/contacts/new" className="underline">
                        Create one first
                      </Link>
                      .
                    </FieldDescription>
                  )}
                  <FieldError errors={[errors.contactId]} />
                </Field>
              )}
            />

            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Textarea id="description" rows={4} {...register("description")} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Where it sits</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="pipelineId"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="pipelineId">Pipeline</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="pipelineId">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {pipelines.map((pipeline) => (
                          <SelectItem key={pipeline.id} value={pipeline.id}>
                            {pipeline.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      Changing this needs a stage from the same pipeline.
                    </FieldDescription>
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="stageId"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="stageId">Stage</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="stageId">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            {stage.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      Won and lost stages close the deal automatically.
                    </FieldDescription>
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="ownerId"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="ownerId">Owner</FieldLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                    >
                      <SelectTrigger id="ownerId">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {owners.map((owner) => (
                          <SelectItem key={owner.id} value={owner.id}>
                            {owner.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="brandId"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="brandId">Brand</FieldLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                    >
                      <SelectTrigger id="brandId">
                        <SelectValue placeholder="No brand" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No brand</SelectItem>
                        {brands.map((brand) => (
                          <SelectItem key={brand.id} value={brand.id}>
                            {brand.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />

              <Field data-invalid={!!errors.expectedCloseDate}>
                <FieldLabel htmlFor="expectedCloseDate">Expected close</FieldLabel>
                <Input
                  id="expectedCloseDate"
                  type="date"
                  {...register("expectedCloseDate")}
                />
                <FieldError errors={[errors.expectedCloseDate]} />
              </Field>

              {/* Amount lives in the schema whether or not it is shown. Hidden
                  means hidden from the form too, so nobody half-fills a field
                  the workspace has chosen not to track. */}
              {showValues && (
                <Field data-invalid={!!errors.amount}>
                  <FieldLabel htmlFor="amount">Value</FieldLabel>
                  <Input
                    id="amount"
                    type="number"
                    min={0}
                    step="0.01"
                    {...register("amount")}
                  />
                  <FieldError errors={[errors.amount]} />
                </Field>
              )}
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isSubmitting || contacts.length === 0}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          {isSubmitting ? "Saving" : dealId ? "Save changes" : "Create deal"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

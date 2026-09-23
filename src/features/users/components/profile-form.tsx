"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { updateOwnProfile } from "../actions";
import {
  updateOwnProfileSchema,
  type UpdateOwnProfileInput,
  type UpdateOwnProfileValues,
} from "../schema";

interface ProfileFormProps {
  defaults: UpdateOwnProfileInput;
  timezones: string[];
}

export function ProfileForm({ defaults, timezones }: ProfileFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateOwnProfileInput, unknown, UpdateOwnProfileValues>({
    resolver: zodResolver(updateOwnProfileSchema),
    defaultValues: defaults,
  });

  async function onSubmit(values: UpdateOwnProfileValues) {
    setFormError(null);

    const result = await updateOwnProfile(values);

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) {
            setError(name as keyof UpdateOwnProfileInput, { message: messages[0] });
          }
        }
      }
      setFormError(result.error);
      return;
    }

    toast.success("Profile updated.");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <Field data-invalid={!!errors.fullName}>
          <FieldLabel htmlFor="profileName">Full name</FieldLabel>
          <Input
            id="profileName"
            aria-invalid={!!errors.fullName}
            {...register("fullName")}
          />
          <FieldError errors={[errors.fullName]} />
        </Field>

        <Field data-invalid={!!errors.jobTitle}>
          <FieldLabel htmlFor="profileJobTitle">Job title</FieldLabel>
          <Input
            id="profileJobTitle"
            placeholder="Optional"
            aria-invalid={!!errors.jobTitle}
            {...register("jobTitle")}
          />
          <FieldError errors={[errors.jobTitle]} />
        </Field>

        <Field data-invalid={!!errors.phone}>
          <FieldLabel htmlFor="profilePhone">Phone</FieldLabel>
          <Input
            id="profilePhone"
            type="tel"
            placeholder="Optional"
            aria-invalid={!!errors.phone}
            {...register("phone")}
          />
          <FieldError errors={[errors.phone]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="profileTimezone">Timezone</FieldLabel>
          <Controller
            control={control}
            name="timezone"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="profileTimezone" onBlur={field.onBlur}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {timezones.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <div>
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            {isSubmitting ? "Saving" : "Save changes"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

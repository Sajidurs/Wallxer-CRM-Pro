"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { TagInput } from "@/components/common/tag-input";
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

import { createContact, updateContact } from "../actions";
import {
  CONTACT_STATUSES,
  CONTACT_TYPES,
  STATUS_LABELS,
  TYPE_LABELS,
  contactSchema,
  type ContactInput,
  type ContactValues,
} from "../schema";

const NONE = "__none__";

interface Option {
  id: string;
  name: string;
}

interface ContactFormProps {
  /** Present when editing. */
  contactId?: string;
  defaults: ContactInput;
  brands: Option[];
  owners: Option[];
  companies: Option[];
}

export function ContactForm({
  contactId,
  defaults,
  brands,
  owners,
  companies,
}: ContactFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput, unknown, ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: defaults,
  });

  async function onSubmit(values: ContactValues) {
    setFormError(null);

    const result = contactId
      ? await updateContact({ id: contactId, values })
      : await createContact(values);

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) {
            setError(name as keyof ContactInput, { message: messages[0] });
          }
        }
      }
      setFormError(result.error);
      return;
    }

    toast.success(contactId ? "Contact updated." : "Contact created.");
    router.replace(`/contacts/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Controller
        control={control}
        name="type"
        render={({ field }) => (
            <Card>
              <CardHeader>
                <CardTitle>Who is this</CardTitle>
                <CardDescription>
                  A company is a contact in its own right. People can be linked
                  to one.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="type">Type</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="type" className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTACT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  {field.value === "person" ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field data-invalid={!!errors.firstName}>
                          <FieldLabel htmlFor="firstName">First name</FieldLabel>
                          <Input
                            id="firstName"
                            aria-invalid={!!errors.firstName}
                            {...register("firstName")}
                          />
                          <FieldError errors={[errors.firstName]} />
                        </Field>
                        <Field data-invalid={!!errors.lastName}>
                          <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                          <Input
                            id="lastName"
                            aria-invalid={!!errors.lastName}
                            {...register("lastName")}
                          />
                          <FieldError errors={[errors.lastName]} />
                        </Field>
                      </div>

                      <Field>
                        <FieldLabel htmlFor="jobTitle">Job title</FieldLabel>
                        <Input id="jobTitle" {...register("jobTitle")} />
                      </Field>

                      <Controller
                        control={control}
                        name="parentContactId"
                        render={({ field: parent }) => (
                          <Field>
                            <FieldLabel htmlFor="parentContactId">
                              Works at
                            </FieldLabel>
                            <Select
                              value={parent.value ?? NONE}
                              onValueChange={(v) =>
                                parent.onChange(v === NONE ? null : v)
                              }
                            >
                              <SelectTrigger id="parentContactId">
                                <SelectValue placeholder="No company" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>No company</SelectItem>
                                {companies.map((company) => (
                                  <SelectItem key={company.id} value={company.id}>
                                    {company.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FieldDescription>
                              {companies.length === 0
                                ? "Create a company contact first to link people to it."
                                : "Links this person to a company contact."}
                            </FieldDescription>
                          </Field>
                        )}
                      />
                    </>
                  ) : (
                    <Field data-invalid={!!errors.companyName}>
                      <FieldLabel htmlFor="companyName">Company name</FieldLabel>
                      <Input
                        id="companyName"
                        aria-invalid={!!errors.companyName}
                        {...register("companyName")}
                      />
                      <FieldError errors={[errors.companyName]} />
                    </Field>
                  )}
                </FieldGroup>
              </CardContent>
            </Card>
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle>How to reach them</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                <FieldError errors={[errors.email]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="website">Website</FieldLabel>
                <Input id="website" placeholder="https://" {...register("website")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <Input id="phone" type="tel" {...register("phone")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="whatsapp">WhatsApp</FieldLabel>
                <Input id="whatsapp" type="tel" {...register("whatsapp")} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="street">Street</FieldLabel>
                <Input id="street" {...register("address.street")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="city">City</FieldLabel>
                <Input id="city" {...register("address.city")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="state">State or region</FieldLabel>
                <Input id="state" {...register("address.state")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="postal">Postal code</FieldLabel>
                <Input id="postal" {...register("address.postal")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="country">Country</FieldLabel>
                <Input id="country" {...register("address.country")} />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Classification</CardTitle>
          <CardDescription>
            Brand is a filter, never a wall. Everyone sees every contact.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="status">Status</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTACT_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {STATUS_LABELS[status]}
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

              <Field>
                <FieldLabel htmlFor="source">Source</FieldLabel>
                <Input
                  id="source"
                  placeholder="Referral, website, event"
                  {...register("source")}
                />
              </Field>
            </div>

            <Controller
              control={control}
              name="tags"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="tags">Tags</FieldLabel>
                  <TagInput
                    id="tags"
                    value={field.value ?? []}
                    onChange={field.onChange}
                  />
                </Field>
              )}
            />

            <Field>
              <FieldLabel htmlFor="notes">Notes</FieldLabel>
              <Textarea id="notes" rows={5} {...register("notes")} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          {isSubmitting
            ? "Saving"
            : contactId
              ? "Save changes"
              : "Create contact"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

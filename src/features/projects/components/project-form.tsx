"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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

import { createProject, updateProject } from "../actions";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  projectSchema,
  type ProjectInput,
  type ProjectValues,
} from "../schema";

const NONE = "__none__";

interface Option {
  id: string;
  name: string;
}

interface ProjectFormProps {
  projectId?: string;
  defaults: ProjectInput;
  clients: Option[];
  brands: Option[];
  owners: Option[];
}

export function ProjectForm({
  projectId,
  defaults,
  clients,
  brands,
  owners,
}: ProjectFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProjectInput, unknown, ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: defaults,
  });

  async function onSubmit(values: ProjectValues) {
    setFormError(null);

    const result = projectId
      ? await updateProject({ id: projectId, values })
      : await createProject(values);

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) {
            setError(name as keyof ProjectInput, { message: messages[0] });
          }
        }
      }
      setFormError(result.error);
      return;
    }

    toast.success(projectId ? "Project updated." : "Project created.");
    router.replace(`/projects/${result.data.id}`);
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
          <CardTitle>The work</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Project name</FieldLabel>
              <Input id="name" autoFocus aria-invalid={!!errors.name} {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.code}>
                <FieldLabel htmlFor="code">Reference code</FieldLabel>
                <Input id="code" placeholder="PRJ-0042" {...register("code")} />
                <FieldDescription>Optional, but must be unique.</FieldDescription>
                <FieldError errors={[errors.code]} />
              </Field>

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
                        {PROJECT_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {PROJECT_STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
            </div>

            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Textarea id="description" rows={4} {...register("description")} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who and when</CardTitle>
          <CardDescription>
            The client links this project to a contact, so their whole history
            sits in one place.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="contactId"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="contactId">Client</FieldLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                    >
                      <SelectTrigger id="contactId">
                        <SelectValue placeholder="No client linked" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No client linked</SelectItem>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {clients.length === 0
                        ? "Create a contact first to link one."
                        : "The contact this work is for."}
                    </FieldDescription>
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
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.startDate}>
                <FieldLabel htmlFor="startDate">Start date</FieldLabel>
                <Input id="startDate" type="date" {...register("startDate")} />
                <FieldError errors={[errors.startDate]} />
              </Field>

              <Field data-invalid={!!errors.dueDate}>
                <FieldLabel htmlFor="dueDate">Due date</FieldLabel>
                <Input id="dueDate" type="date" aria-invalid={!!errors.dueDate} {...register("dueDate")} />
                <FieldError errors={[errors.dueDate]} />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          {isSubmitting ? "Saving" : projectId ? "Save changes" : "Create project"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

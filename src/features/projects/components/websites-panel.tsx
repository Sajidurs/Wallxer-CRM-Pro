"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Globe, Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { addWebsite, deleteWebsite } from "../actions";
import type { ProjectWebsite } from "../queries";
import {
  ENVIRONMENTS,
  ENVIRONMENT_LABELS,
  websiteSchema,
  type Environment,
  type WebsiteInput,
  type WebsiteValues,
} from "../schema";

interface WebsitesPanelProps {
  projectId: string;
  websites: ProjectWebsite[];
  canEdit: boolean;
}

const ENVIRONMENT_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  live: "default",
  staging: "secondary",
  dev: "outline",
  admin: "outline",
};

export function WebsitesPanel({
  projectId,
  websites,
  canEdit,
}: WebsitesPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<WebsiteInput, unknown, WebsiteValues>({
    resolver: zodResolver(websiteSchema),
    defaultValues: {
      projectId,
      label: "",
      url: "",
      environment: "live",
      notes: "",
    },
  });

  async function onSubmit(values: WebsiteValues) {
    const result = await addWebsite(values);

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) {
            setError(name as keyof WebsiteInput, { message: messages[0] });
          }
        }
      }
      toast.error(result.error);
      return;
    }

    toast.success("Link added.");
    setOpen(false);
    reset({ projectId, label: "", url: "", environment: "live", notes: "" });
    router.refresh();
  }

  function remove(id: string, label: string) {
    startTransition(async () => {
      const result = await deleteWebsite({ id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${label} removed.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {websites.length > 0 && canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus />
            Add link
          </Button>
        </div>
      )}

      {websites.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No links yet"
          description="Live site, staging, admin panel. A project usually needs more than one."
          action={
            canEdit && (
              <Button onClick={() => setOpen(true)}>
                <Plus />
                Add link
              </Button>
            )
          }
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {websites.map((site) => (
            <li key={site.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{site.label}</span>
                  <Badge variant={ENVIRONMENT_VARIANT[site.environment] ?? "outline"}>
                    {ENVIRONMENT_LABELS[site.environment as Environment] ??
                      site.environment}
                  </Badge>
                </div>
                <a
                  href={site.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm text-muted-foreground hover:underline"
                >
                  {site.url}
                </a>
                {site.notes && (
                  <p className="mt-1 text-xs text-muted-foreground">{site.notes}</p>
                )}
              </div>

              <Button variant="ghost" size="icon" asChild>
                <a
                  href={site.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${site.label}`}
                >
                  <ExternalLink />
                </a>
              </Button>

              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isPending}
                  onClick={() => remove(site.id, site.label)}
                  aria-label={`Remove ${site.label}`}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a link</DialogTitle>
            <DialogDescription>
              Any URL this project needs. Paste it without the scheme and https
              is assumed.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <FieldGroup>
              <Field data-invalid={!!errors.label}>
                <FieldLabel htmlFor="siteLabel">Label</FieldLabel>
                <Input
                  id="siteLabel"
                  placeholder="Live site"
                  autoFocus
                  aria-invalid={!!errors.label}
                  {...register("label")}
                />
                <FieldError errors={[errors.label]} />
              </Field>

              <Field data-invalid={!!errors.url}>
                <FieldLabel htmlFor="siteUrl">URL</FieldLabel>
                <Input
                  id="siteUrl"
                  placeholder="example.com"
                  aria-invalid={!!errors.url}
                  {...register("url")}
                />
                <FieldError errors={[errors.url]} />
              </Field>

              <Controller
                control={control}
                name="environment"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="siteEnv">Environment</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="siteEnv">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ENVIRONMENTS.map((environment) => (
                          <SelectItem key={environment} value={environment}>
                            {ENVIRONMENT_LABELS[environment]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />

              <Field>
                <FieldLabel htmlFor="siteNotes">Notes</FieldLabel>
                <Input id="siteNotes" placeholder="Optional" {...register("notes")} />
              </Field>
            </FieldGroup>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="animate-spin" />}
                {isSubmitting ? "Adding" : "Add link"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

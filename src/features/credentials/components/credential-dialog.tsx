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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

import { createCredential, updateCredential } from "../actions";
import type { CredentialListItem } from "../queries";
import {
  CATEGORY_LABELS,
  CREDENTIAL_CATEGORIES,
  createCredentialSchema,
  updateCredentialSchema,
  type CreateCredentialInput,
  type CreateCredentialValues,
  type CredentialCategory,
  type UpdateCredentialInput,
  type UpdateCredentialValues,
} from "../schema";

/**
 * Creating and editing are two forms, not one form with a union type.
 *
 * They genuinely differ: creating requires a secret, editing must not, because
 * the edit form never displays the stored value and requiring it would force a
 * reveal — logged as an access that never needed to happen — just to fix a
 * typo in a label. Trying to express both with one `useForm` produced types
 * that only `as never` could satisfy, which is the compiler pointing at the
 * design rather than at itself.
 */

function CreateForm({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateCredentialInput, unknown, CreateCredentialValues>({
    resolver: zodResolver(createCredentialSchema),
    defaultValues: {
      projectId,
      label: "",
      category: "other",
      url: "",
      username: "",
      secret: "",
      notes: "",
      contactId: null,
    },
  });

  async function onSubmit(values: CreateCredentialValues) {
    setFormError(null);
    const result = await createCredential(values);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    toast.success("Credential saved, encrypted.");
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <FieldGroup>
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <Field data-invalid={!!errors.label}>
          <FieldLabel htmlFor="credLabel">Label</FieldLabel>
          <Input
            id="credLabel"
            placeholder="cPanel — main hosting"
            autoFocus
            aria-invalid={!!errors.label}
            {...register("label")}
          />
          <FieldError errors={[errors.label]} />
        </Field>

        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="credCategory">Category</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="credCategory">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREDENTIAL_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {CATEGORY_LABELS[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />

        <Field>
          <FieldLabel htmlFor="credUrl">Login URL</FieldLabel>
          <Input id="credUrl" placeholder="https://" {...register("url")} />
        </Field>

        <Field>
          <FieldLabel htmlFor="credUsername">Username</FieldLabel>
          <Input id="credUsername" autoComplete="off" {...register("username")} />
          <FieldDescription>
            Not encrypted. Usernames are not secrets, and being able to read them
            keeps the list useful.
          </FieldDescription>
        </Field>

        <Field data-invalid={!!errors.secret}>
          <FieldLabel htmlFor="credSecret">Password or key</FieldLabel>
          <Input
            id="credSecret"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.secret}
            {...register("secret")}
          />
          <FieldError errors={[errors.secret]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="credNotes">Recovery codes or extra keys</FieldLabel>
          <Textarea id="credNotes" rows={3} {...register("notes")} />
          <FieldDescription>Encrypted alongside the password.</FieldDescription>
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          {isSubmitting ? "Saving" : "Add credential"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditForm({
  credential,
  onDone,
}: {
  credential: CredentialListItem;
  onDone: () => void;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateCredentialInput, unknown, UpdateCredentialValues>({
    resolver: zodResolver(updateCredentialSchema),
    defaultValues: {
      id: credential.id,
      label: credential.label,
      category: credential.category as CredentialCategory,
      url: credential.url ?? "",
      username: credential.username ?? "",
      secret: "",
      notes: "",
      clearNotes: false,
    },
  });

  async function onSubmit(values: UpdateCredentialValues) {
    setFormError(null);
    const result = await updateCredential(values);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    toast.success("Credential updated.");
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <FieldGroup>
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <Field data-invalid={!!errors.label}>
          <FieldLabel htmlFor="credLabelEdit">Label</FieldLabel>
          <Input
            id="credLabelEdit"
            autoFocus
            aria-invalid={!!errors.label}
            {...register("label")}
          />
          <FieldError errors={[errors.label]} />
        </Field>

        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="credCategoryEdit">Category</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="credCategoryEdit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREDENTIAL_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {CATEGORY_LABELS[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />

        <Field>
          <FieldLabel htmlFor="credUrlEdit">Login URL</FieldLabel>
          <Input id="credUrlEdit" placeholder="https://" {...register("url")} />
        </Field>

        <Field>
          <FieldLabel htmlFor="credUsernameEdit">Username</FieldLabel>
          <Input id="credUsernameEdit" autoComplete="off" {...register("username")} />
        </Field>

        <Field data-invalid={!!errors.secret}>
          <FieldLabel htmlFor="credSecretEdit">Password or key</FieldLabel>
          <Input
            id="credSecretEdit"
            type="password"
            autoComplete="new-password"
            placeholder="Leave blank to keep the current one"
            aria-invalid={!!errors.secret}
            {...register("secret")}
          />
          <FieldDescription>
            Blank keeps what is stored. The existing value is never shown here,
            so correcting a label does not require revealing the password.
          </FieldDescription>
          <FieldError errors={[errors.secret]} />
        </Field>

        <Field>
          <FieldLabel htmlFor="credNotesEdit">Recovery codes or extra keys</FieldLabel>
          <Textarea
            id="credNotesEdit"
            rows={3}
            placeholder="Leave blank to keep the current notes"
            {...register("notes")}
          />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          {isSubmitting ? "Saving" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface CredentialDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CredentialListItem | null;
}

export function CredentialDialog({
  projectId,
  open,
  onOpenChange,
  editing,
}: CredentialDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit credential" : "Add a credential"}
          </DialogTitle>
          <DialogDescription>
            The password is encrypted before it is stored. Anyone on the team can
            reveal it, and every reveal is recorded against their name.
          </DialogDescription>
        </DialogHeader>

        {/* Keyed so switching between add and edit remounts the form rather
            than leaving one set of values in the other's fields. */}
        {editing ? (
          <EditForm
            key={editing.id}
            credential={editing}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <CreateForm
            key="create"
            projectId={projectId}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

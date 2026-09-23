"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, UserPlus } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Role } from "@/lib/permissions";

import { inviteUser } from "../actions";
import {
  inviteUserSchema,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  USER_ROLES,
  type InviteUserInput,
  type InviteUserValues,
} from "../schema";
import { TemporaryPasswordDialog } from "./temporary-password-dialog";

interface InviteUserDialogProps {
  /** Only a super admin may create another super admin. */
  actorRole: Role;
  /** False when the project has no working SMTP, which changes the default. */
  emailAvailable: boolean;
}

export function InviteUserDialog({
  actorRole,
  emailAvailable,
}: InviteUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(
    null,
  );

  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InviteUserInput, unknown, InviteUserValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: "",
      fullName: "",
      jobTitle: "",
      role: "member",
      delivery: emailAvailable ? "email" : "password",
    },
  });

  const assignableRoles = USER_ROLES.filter(
    (candidate) => candidate !== "super_admin" || actorRole === "super_admin",
  );

  async function onSubmit(values: InviteUserValues) {
    setFormError(null);

    const result = await inviteUser(values);

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) {
            setError(name as keyof InviteUserInput, { message: messages[0] });
          }
        }
      }
      setFormError(result.error);
      return;
    }

    setOpen(false);
    reset();

    if (result.data.temporaryPassword) {
      setIssued({
        email: result.data.email,
        password: result.data.temporaryPassword,
      });
    } else {
      toast.success(`Invite sent to ${result.data.email}.`);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            reset();
            setFormError(null);
          }
        }}
      >
        <DialogTrigger asChild>
          <Button>
            <UserPlus />
            Add user
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a user</DialogTitle>
            <DialogDescription>
              They join this workspace with the role you pick. Roles can be
              changed later by a super admin.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              {formError && (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <Field data-invalid={!!errors.fullName}>
                <FieldLabel htmlFor="fullName">Full name</FieldLabel>
                <Input
                  id="fullName"
                  autoFocus
                  aria-invalid={!!errors.fullName}
                  {...register("fullName")}
                />
                <FieldError errors={[errors.fullName]} />
              </Field>

              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="inviteEmail">Email</FieldLabel>
                <Input
                  id="inviteEmail"
                  type="email"
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                <FieldError errors={[errors.email]} />
              </Field>

              <Field data-invalid={!!errors.jobTitle}>
                <FieldLabel htmlFor="jobTitle">Job title</FieldLabel>
                <Input
                  id="jobTitle"
                  placeholder="Optional"
                  aria-invalid={!!errors.jobTitle}
                  {...register("jobTitle")}
                />
                <FieldError errors={[errors.jobTitle]} />
              </Field>

              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="role">Role</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="role" onBlur={field.onBlur}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableRoles.map((candidate) => (
                          <SelectItem key={candidate} value={candidate}>
                            {ROLE_LABELS[candidate]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {ROLE_DESCRIPTIONS[field.value]}
                    </FieldDescription>
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="delivery"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="delivery">How they get in</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="delivery" onBlur={field.onBlur}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">
                          Email them an invite link
                        </SelectItem>
                        <SelectItem value="password">
                          Give me a temporary password
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {field.value === "email"
                        ? emailAvailable
                          ? "They receive a link to set their own password."
                          : "This project has no custom SMTP yet, so the built-in mailer allows 2 emails per hour and may not reach outside addresses."
                        : "You pass the password to them yourself. They must change it on first sign-in."}
                    </FieldDescription>
                  </Field>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="animate-spin" />}
                  {isSubmitting ? "Adding" : "Add user"}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>

      {issued && (
        <TemporaryPasswordDialog
          open
          onClose={() => setIssued(null)}
          email={issued.email}
          password={issued.password}
          title="Account created"
        />
      )}
    </>
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, KeyRound, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { BOT_SCOPES, type BotScope } from "@/features/mcp/auth";

import { createBotKey, revokeBotKey } from "../actions";
import type { BotKeyRow } from "../queries";
import {
  createBotKeySchema,
  type CreateBotKeyInput,
  type CreateBotKeyValues,
} from "../schema";

const SCOPE_LABELS: Record<BotScope, string> = {
  read: "Read",
  write: "Write",
  finance: "Finance",
};

const SCOPE_HINTS: Record<BotScope, string> = {
  read: "List and open records",
  write: "Create and update. Includes read.",
  finance: "Invoices and the ledger, and only if this person already has finance access",
};

interface ProfileOption {
  id: string;
  full_name: string;
  email: string;
  role: string;
  finance_access: boolean;
}

interface BotKeysPanelProps {
  keys: BotKeyRow[];
  profiles: ProfileOption[];
}

function when(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function BotKeysPanel({ keys, profiles }: BotKeysPanelProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateBotKeyInput, unknown, CreateBotKeyValues>({
    resolver: zodResolver(createBotKeySchema),
    defaultValues: { name: "", profileId: "", scopes: ["read"] },
  });

  async function onSubmit(values: CreateBotKeyValues) {
    setFormError(null);
    const result = await createBotKey(values);
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) setError(name as keyof CreateBotKeyInput, { message: messages[0] });
        }
      }
      setFormError(result.error);
      return;
    }

    reset({ name: "", profileId: "", scopes: ["read"] });
    setCopied(false);
    setIssued({ name: values.name, token: result.data.token });
    router.refresh();
  }

  async function revoke(id: string) {
    setRevoking(id);
    const result = await revokeBotKey({ id });
    setRevoking(null);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    router.refresh();
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const names = new Map(profiles.map((profile) => [profile.id, profile.full_name]));

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div>
          <h2 className="font-medium">New key</h2>
          <p className="text-sm text-muted-foreground">
            The key acts as the person you pick, so their role and finance access still apply.
            The secret is shown once.
          </p>
        </div>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="bot-key-name">Name</FieldLabel>
            <Input id="bot-key-name" placeholder="Grok Bot" {...register("name")} />
            <FieldError>{errors.name?.message}</FieldError>
          </Field>

          <Field>
            <FieldLabel>Acts as</FieldLabel>
            <Controller
              control={control}
              name="profileId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a person" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.full_name} · {profile.role}
                        {profile.finance_access ? " · finance" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError>{errors.profileId?.message}</FieldError>
          </Field>

          <Field>
            <FieldLabel>Scopes</FieldLabel>
            <Controller
              control={control}
              name="scopes"
              render={({ field }) => (
                <div className="space-y-2">
                  {BOT_SCOPES.map((scope) => {
                    const checked = field.value?.includes(scope) ?? false;
                    return (
                      <label key={scope} className="flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) => {
                            const current = field.value ?? [];
                            field.onChange(
                              next === true
                                ? [...current, scope]
                                : current.filter((item) => item !== scope),
                            );
                          }}
                        />
                        <span>
                          <span className="font-medium">{SCOPE_LABELS[scope]}</span>
                          <span className="block text-muted-foreground">{SCOPE_HINTS[scope]}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            />
            <FieldError>{errors.scopes?.message}</FieldError>
          </Field>
        </FieldGroup>

        {formError && (
          <Alert>
            <TriangleAlert />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={isSubmitting}>
          <KeyRound />
          {isSubmitting ? "Creating…" : "Create key"}
        </Button>
      </form>

      <div className="space-y-3">
        {keys.length === 0 && (
          <p className="text-sm text-muted-foreground">No keys yet.</p>
        )}
        {keys.map((key) => (
          <div key={key.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
            <div className="min-w-0 space-y-1">
              <div className="font-medium">
                {key.name}{" "}
                <code className="text-xs text-muted-foreground">{key.key_prefix}…</code>
              </div>
              <p className="text-sm text-muted-foreground">
                {names.get(key.profile_id) ?? "Former user"} · {key.scopes.join(", ")}
              </p>
              <p className="text-xs text-muted-foreground">
                Created {when(key.created_at)} · Last used {when(key.last_used_at)}
                {key.revoked_at ? ` · Revoked ${when(key.revoked_at)}` : ""}
              </p>
            </div>
            {!key.revoked_at && (
              <Button
                type="button"
                variant="destructive"
                disabled={revoking === key.id}
                onClick={() => revoke(key.id)}
              >
                {revoking === key.id ? "Revoking…" : "Revoke"}
              </Button>
            )}
          </div>
        ))}
      </div>

      <Dialog open={issued !== null} onOpenChange={(open) => !open && setIssued(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Copy {issued?.name}</DialogTitle>
            <DialogDescription>
              This is the only time the key is shown. Store it in the assistant&apos;s
              secret store. It cannot be displayed again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
              <code className="flex-1 break-all font-mono text-sm">{issued?.token}</code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Copy API key"
                onClick={() => issued && copy(issued.token)}
              >
                {copied ? <Check className="text-green-600" /> : <Copy />}
              </Button>
            </div>
            <Alert>
              <TriangleAlert />
              <AlertDescription>
                Closing this dialog discards the key. Revoke it and create another if you lose it.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setIssued(null)}>
              {copied ? "Done" : "I have saved it"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

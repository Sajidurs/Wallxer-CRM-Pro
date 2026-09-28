import { z } from "zod";

import { optionalId, optionalText } from "@/lib/zod";

export const CREDENTIAL_CATEGORIES = [
  "hosting",
  "domain",
  "cms",
  "ftp",
  "database",
  "email",
  "analytics",
  "social",
  "other",
] as const;

export type CredentialCategory = (typeof CREDENTIAL_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CredentialCategory, string> = {
  hosting: "Hosting",
  domain: "Domain",
  cms: "CMS",
  ftp: "FTP / SFTP",
  database: "Database",
  email: "Email",
  analytics: "Analytics",
  social: "Social",
  other: "Other",
};

export const CREDENTIAL_KINDS = ["stored", "link"] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export const KIND_LABELS: Record<CredentialKind, string> = {
  stored: "Store the secret here",
  link: "Link to an external vault",
};

/**
 * A vault link is a credential whose secret is a URL.
 *
 * It is validated harder than a password is, because a typo in a password is
 * discovered the moment someone tries it, while a typo in a vault link is
 * discovered when somebody urgently needs the password and cannot find it.
 */
const vaultUrl = () =>
  z
    .string()
    .trim()
    .max(2000, "That link is too long")
    .refine((value) => /^https:\/\/\S+$/i.test(value), {
      message: "Paste the full https:// link to the sheet or doc",
    });

/**
 * One shape for both kinds: `secret` carries the password or the vault URL, and
 * `kind` says which. Everything downstream — the encryption, the access log,
 * the thirty-second reveal — then applies to a link exactly as it does to a
 * password, which is the whole point.
 */
export const createCredentialSchema = z
  .object({
    projectId: z.uuid(),
    contactId: optionalId(),
    label: z
      .string()
      .min(2, "Give the credential a label")
      .max(120, "That label is too long")
      .transform((value) => value.trim()),
    category: z.enum(CREDENTIAL_CATEGORIES),
    kind: z.enum(CREDENTIAL_KINDS).default("stored"),
    url: optionalText(500, "That URL is too long"),
    username: optionalText(200, "That username is too long"),
    secret: z
      .string()
      .min(1, "Enter the password or key")
      .max(5000, "That secret is too long"),
    notes: optionalText(5000, "Those notes are too long"),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "link") {
      const parsed = vaultUrl().safeParse(value.secret);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: ["secret"],
          message: parsed.error.issues[0]?.message ?? "That link is not valid",
        });
      }
    }
  });

export type CreateCredentialInput = z.input<typeof createCredentialSchema>;
export type CreateCredentialValues = z.output<typeof createCredentialSchema>;

/**
 * Editing.
 *
 * `secret` is optional here and empty means "leave it alone", because the edit
 * form never shows the stored value. Requiring it would mean revealing a
 * password just to correct a label — and that reveal would, correctly, be
 * logged as an access that never needed to happen.
 */
export const updateCredentialSchema = z
  .object({
    id: z.uuid(),
    label: z
      .string()
      .min(2, "Give the credential a label")
      .max(120, "That label is too long")
      .transform((value) => value.trim()),
    category: z.enum(CREDENTIAL_CATEGORIES),
    kind: z.enum(CREDENTIAL_KINDS),
    url: optionalText(500, "That URL is too long"),
    username: optionalText(200, "That username is too long"),
    secret: z
      .string()
      .max(5000, "That secret is too long")
      .nullish()
      .transform((value) => value?.trim() || null),
    notes: optionalText(5000, "Those notes are too long"),
    clearNotes: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    // Only when one was actually typed: an empty secret means "leave it alone",
    // which is how a label gets corrected without revealing anything.
    if (value.kind === "link" && value.secret) {
      const parsed = vaultUrl().safeParse(value.secret);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: ["secret"],
          message: parsed.error.issues[0]?.message ?? "That link is not valid",
        });
      }
    }
  });

export type UpdateCredentialInput = z.input<typeof updateCredentialSchema>;
export type UpdateCredentialValues = z.output<typeof updateCredentialSchema>;

export const revealCredentialSchema = z.object({ id: z.uuid() });

export const deleteCredentialSchema = z.object({
  id: z.uuid(),
  deleted: z.boolean().default(true),
});

/**
 * How long a revealed secret stays in component state before it is wiped.
 * SYSTEM_DESIGN 7.3: "clears after 30 seconds".
 */
export const REVEAL_TTL_MS = 30_000;

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

export const createCredentialSchema = z.object({
  projectId: z.uuid(),
  contactId: optionalId(),
  label: z
    .string()
    .min(2, "Give the credential a label")
    .max(120, "That label is too long")
    .transform((value) => value.trim()),
  category: z.enum(CREDENTIAL_CATEGORIES),
  url: optionalText(500, "That URL is too long"),
  username: optionalText(200, "That username is too long"),
  secret: z
    .string()
    .min(1, "Enter the password or key")
    .max(5000, "That secret is too long"),
  notes: optionalText(5000, "Those notes are too long"),
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
export const updateCredentialSchema = z.object({
  id: z.uuid(),
  label: z
    .string()
    .min(2, "Give the credential a label")
    .max(120, "That label is too long")
    .transform((value) => value.trim()),
  category: z.enum(CREDENTIAL_CATEGORIES),
  url: optionalText(500, "That URL is too long"),
  username: optionalText(200, "That username is too long"),
  secret: z
    .string()
    .max(5000, "That secret is too long")
    .nullish()
    .transform((value) => value?.trim() || null),
  notes: optionalText(5000, "Those notes are too long"),
  clearNotes: z.boolean().default(false),
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

import { z } from "zod";

import { ENTITY_TYPES } from "@/lib/entities";
import { optionalText } from "@/lib/zod";

export const LINK_KINDS = [
  "video",
  "document",
  "design",
  "repository",
  "reference",
] as const;

export type LinkKind = (typeof LINK_KINDS)[number];

export const LINK_KIND_LABELS: Record<LinkKind, string> = {
  video: "Recorded video",
  document: "Document",
  design: "Design",
  repository: "Repository",
  reference: "Reference",
};

/**
 * Accepts "example.com" and adds the scheme the person meant. The check
 * constraint requires one, and rejecting a paste for a missing "https://" is
 * the kind of friction that gets a feature quietly stopped being used.
 */
export const urlField = () =>
  z
    .string()
    .min(1, "Enter the URL")
    .max(500, "That URL is too long")
    .transform((value) => {
      const trimmed = value.trim();
      return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    })
    .refine(
      (value) => /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(value),
      "That does not look like a URL",
    );

export const resourceLinkSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.uuid(),
  kind: z.enum(LINK_KINDS),
  name: z
    .string()
    .min(1, "Give the link a name")
    .max(120, "That name is too long")
    .transform((value) => value.trim()),
  url: urlField(),
});

export type ResourceLinkInput = z.input<typeof resourceLinkSchema>;
export type ResourceLinkValues = z.output<typeof resourceLinkSchema>;

/**
 * A link as it appears inside the task form, before the task exists.
 *
 * The form collects links alongside the task, so they cannot carry an entity id
 * until the task has been created. The action writes them afterwards.
 */
export const draftLinkSchema = z.object({
  kind: z.enum(LINK_KINDS),
  name: z
    .string()
    .min(1, "Give the link a name")
    .max(120, "That name is too long")
    .transform((value) => value.trim()),
  url: urlField(),
});

export type DraftLinkInput = z.input<typeof draftLinkSchema>;
export type DraftLinkValues = z.output<typeof draftLinkSchema>;

export const deleteResourceLinkSchema = z.object({ id: z.uuid() });

/** Optional note field shared by link forms. */
export const linkNotes = () => optionalText(300, "That note is too long");

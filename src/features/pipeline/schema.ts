import { z } from "zod";

import { optionalId, optionalText } from "@/lib/zod";

export const DEAL_STATUSES = ["open", "won", "lost"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  open: "Open",
  won: "Won",
  lost: "Lost",
};

const optionalDate = () =>
  z
    .string()
    .nullish()
    .transform((value) => value?.trim() || null)
    .refine(
      (value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value),
      "Use the date picker",
    );

/**
 * Money is `numeric(14,2)` and never a float. Parsed from the string a number
 * input sends, kept as a number here, and written back as-is.
 */
const optionalAmount = () =>
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value) => {
      if (value === null || value === undefined || value === "") return null;
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
    });

export const dealSchema = z.object({
  title: z
    .string()
    .min(2, "Give the deal a title")
    .max(200, "That title is too long")
    .transform((value) => value.trim()),
  description: optionalText(5000, "That description is too long"),
  // Section 8.3: a deal is created by picking an existing contact. Required,
  // not optional — a deal with nobody on the other side of it is not a deal.
  contactId: z.uuid("Pick the contact this deal is with"),
  pipelineId: z.uuid(),
  stageId: z.uuid(),
  brandId: optionalId(),
  ownerId: optionalId(),
  expectedCloseDate: optionalDate(),
  amount: optionalAmount(),
  currency: z
    .string()
    .max(3, "Use a three letter currency code")
    .nullish()
    .transform((value) => value?.trim().toUpperCase() || "USD"),
});

export type DealInput = z.input<typeof dealSchema>;
export type DealValues = z.output<typeof dealSchema>;

export const updateDealSchema = z.object({
  id: z.uuid(),
  values: dealSchema,
});

export const deleteDealSchema = z.object({
  id: z.uuid(),
  deleted: z.boolean().default(true),
});

/** Board drag and drop: stage and ordering only. */
export const moveDealSchema = z.object({
  id: z.uuid(),
  stageId: z.uuid(),
  position: z.number().finite(),
});

export const dealFiltersSchema = z.object({
  pipelineId: z.uuid().optional(),
  q: z.string().trim().max(120).optional(),
  ownerId: z.uuid().optional(),
  brandId: z.uuid().optional(),
  status: z.enum(DEAL_STATUSES).optional(),
});

export type DealFilters = z.output<typeof dealFiltersSchema>;

// ---------------------------------------------------------------------------
// Stage administration
// ---------------------------------------------------------------------------

export const stageSchema = z.object({
  pipelineId: z.uuid(),
  name: z
    .string()
    .min(1, "Give the stage a name")
    .max(60, "That name is too long")
    .transform((value) => value.trim()),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, "Use a hex colour like #3b82f6")
    .nullish()
    .transform((value) => value?.toLowerCase() || "#64748b"),
  outcome: z.enum(["none", "won", "lost"]).default("none"),
});

export type StageInput = z.input<typeof stageSchema>;
export type StageValues = z.output<typeof stageSchema>;

export const updateStageSchema = z.object({
  id: z.uuid(),
  name: z
    .string()
    .min(1, "Give the stage a name")
    .max(60, "That name is too long")
    .transform((value) => value.trim()),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, "Use a hex colour like #3b82f6")
    .nullish()
    .transform((value) => value?.toLowerCase() || "#64748b"),
  outcome: z.enum(["none", "won", "lost"]).default("none"),
  isActive: z.boolean().default(true),
});

export const moveStageSchema = z.object({
  id: z.uuid(),
  direction: z.enum(["up", "down"]),
});

export const pipelineSchema = z.object({
  name: z
    .string()
    .min(1, "Give the pipeline a name")
    .max(80, "That name is too long")
    .transform((value) => value.trim()),
  brandId: optionalId(),
});

export type PipelineInput = z.input<typeof pipelineSchema>;

/** Midpoint ordering, same as tasks. */
export function midpoint(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1000;
  if (before === null) return after! - 1000;
  if (after === null) return before + 1000;
  return (before + after) / 2;
}

/**
 * Deal amounts exist in the schema but stay out of the UI until the workspace
 * setting turns them on. One place decides, so nothing renders a number the
 * workspace has chosen not to track.
 */
export function showValues(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return false;
  const pipeline = (settings as Record<string, unknown>).pipeline;
  if (!pipeline || typeof pipeline !== "object") return false;
  return (pipeline as Record<string, unknown>).show_values === true;
}

export function formatAmount(
  amount: number | null,
  currency: string | null,
): string | null {
  if (amount === null) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // An unknown currency code should not take the page down.
    return `${currency ?? ""} ${amount.toLocaleString()}`.trim();
  }
}

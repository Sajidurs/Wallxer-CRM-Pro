import { z } from "zod";

import { CURRENCIES, parseAmountToMinor } from "@/lib/money";
import { optionalId, optionalText } from "@/lib/zod";

export const RENEWAL_CATEGORIES = [
  "hosting",
  "domain",
  "tool",
  "ssl",
  "email",
  "maintenance",
  "other",
] as const;
export type RenewalCategory = (typeof RENEWAL_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<RenewalCategory, string> = {
  hosting: "Hosting",
  domain: "Domain",
  tool: "Tool licence",
  ssl: "SSL",
  email: "Email",
  maintenance: "Maintenance",
  other: "Other",
};

export const RENEWAL_STATUSES = ["active", "cancelled", "lapsed"] as const;
export type RenewalStatus = (typeof RENEWAL_STATUSES)[number];

export const STATUS_LABELS: Record<RenewalStatus, string> = {
  active: "Active",
  cancelled: "Cancelled",
  lapsed: "Lapsed",
};

export const RENEWAL_CYCLES = [
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
  "biennial",
] as const;
export type RenewalCycle = (typeof RENEWAL_CYCLES)[number];

export const CYCLE_LABELS: Record<RenewalCycle, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Every 6 months",
  yearly: "Yearly",
  biennial: "Every 2 years",
};

/** Months per cycle, for the "what this is worth a year" figure. */
export const CYCLE_MONTHS: Record<RenewalCycle, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
  biennial: 24,
};

/** Optional money: blank means "nobody recorded it", not zero. */
const optionalMinor = (label: string) =>
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value, ctx) => {
      if (value === null || value === undefined || value === "") return null;
      const minor =
        typeof value === "number" ? Math.round(value) : parseAmountToMinor(value);
      if (minor === null || minor < 0) {
        ctx.addIssue({ code: "custom", message: `${label} is not a valid amount` });
        return z.NEVER;
      }
      if (minor > 100_000_000_000) {
        ctx.addIssue({ code: "custom", message: `${label} is too large` });
        return z.NEVER;
      }
      return minor;
    });

const requiredDate = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), message);

const optionalDate = () =>
  z
    .string()
    .nullish()
    .transform((value) => value?.trim() || null)
    .refine(
      (value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value),
      "That date is not valid",
    );

export const renewalSchema = z
  .object({
    name: z
      .string()
      .max(160, "That name is too long")
      .transform((value) => value.trim())
      .refine((value) => value.length > 0, "Give it a name, like “Elementor Pro”"),

    category: z.enum(RENEWAL_CATEGORIES),
    vendor: optionalText(120, "That vendor name is too long"),

    contactId: optionalId(),
    projectId: optionalId(),
    brandId: optionalId(),

    status: z.enum(RENEWAL_STATUSES),
    cycle: z.enum(RENEWAL_CYCLES),

    startedOn: requiredDate("Pick the date it started"),
    nextRenewalOn: requiredDate("Pick the next renewal date"),
    lastRenewedOn: optionalDate(),

    currency: z.enum(CURRENCIES),
    price: optionalMinor("The price"),
    cost: optionalMinor("The cost"),

    autoRenew: z.boolean(),
    reminderDays: z
      .union([z.string(), z.number()])
      .transform((value, ctx) => {
        const n = typeof value === "number" ? value : Number(String(value).trim() || "14");
        if (!Number.isFinite(n) || n < 0 || n > 365) {
          ctx.addIssue({ code: "custom", message: "Between 0 and 365 days" });
          return z.NEVER;
        }
        return Math.round(n);
      }),

    loginUrl: optionalText(500, "That URL is too long"),
    notes: optionalText(2000, "That note is too long"),
  })
  .refine((v) => v.nextRenewalOn >= v.startedOn, {
    message: "The next renewal cannot be before it started",
    path: ["nextRenewalOn"],
  })
  .refine((v) => !v.lastRenewedOn || v.lastRenewedOn >= v.startedOn, {
    message: "The last renewal cannot be before it started",
    path: ["lastRenewedOn"],
  });

export type RenewalValues = z.output<typeof renewalSchema>;
export type RenewalInput = z.input<typeof renewalSchema>;

export const updateRenewalSchema = z.object({
  id: z.uuid(),
  values: renewalSchema,
});

export const advanceRenewalSchema = z.object({ id: z.uuid() });

export const deleteRenewalSchema = z.object({
  id: z.uuid(),
  deleted: z.boolean(),
});

export const renewalFiltersSchema = z.object({
  q: optionalText(120, "That search is too long"),
  category: z.enum(RENEWAL_CATEGORIES).optional(),
  status: z.enum(RENEWAL_STATUSES).optional(),
  contactId: z.uuid().optional(),
  /** `due` narrows to what needs attention, which is why anyone opens this. */
  due: z.enum(["overdue", "30", "90"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export type RenewalFilters = z.output<typeof renewalFiltersSchema>;

export const PAGE_SIZE = 50;

/**
 * Days until renewal, negative when it has already passed.
 *
 * Compared as calendar dates rather than instants: a renewal due today is due
 * today in Dhaka and in Zurich, and an hours-based comparison would call it
 * overdue for half the team.
 */
export function daysUntil(dateIso: string, today = new Date()): number {
  const due = new Date(`${dateIso}T00:00:00Z`);
  const now = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}

export function isOverdue(row: { next_renewal_on: string; status: string }): boolean {
  return row.status === "active" && daysUntil(row.next_renewal_on) < 0;
}

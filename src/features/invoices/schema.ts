import { z } from "zod";

import { CURRENCIES } from "@/lib/money";
import { parseAmountToMinor } from "@/lib/money";
import { optionalId, optionalText } from "@/lib/zod";

export const INVOICE_STATUSES = ["draft", "sent", "paid", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  cancelled: "Cancelled",
};

/**
 * Money in, as minor units out.
 *
 * A number member on the union is what makes `parse(parse(x))` hold: a form
 * submits the resolver's output, and the action re-validates that output.
 */
const amountMinor = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((value, ctx) => {
      const minor =
        typeof value === "number" ? Math.round(value) : parseAmountToMinor(value);

      if (minor === null) {
        ctx.addIssue({ code: "custom", message: `Enter ${label}` });
        return z.NEVER;
      }
      if (minor < 0) {
        ctx.addIssue({ code: "custom", message: `${label} cannot be negative` });
        return z.NEVER;
      }
      if (minor > 100_000_000_000) {
        ctx.addIssue({ code: "custom", message: "That amount is too large" });
        return z.NEVER;
      }
      return minor;
    });

const quantity = () =>
  z
    .union([z.string(), z.number()])
    .transform((value, ctx) => {
      const parsed = typeof value === "number" ? value : Number(String(value).trim());
      if (!Number.isFinite(parsed) || parsed <= 0) {
        ctx.addIssue({ code: "custom", message: "Quantity must be above zero" });
        return z.NEVER;
      }
      // Three decimal places, matching the column.
      return Math.round(parsed * 1000) / 1000;
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

export const invoiceItemSchema = z.object({
  description: z
    .string()
    .max(300, "That description is too long")
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, "Describe the line"),
  quantity: quantity(),
  unitAmount: amountMinor("a rate"),
});

export type InvoiceItemInput = z.input<typeof invoiceItemSchema>;

export const invoiceSchema = z
  .object({
    brandId: z.uuid("Choose which company is issuing this"),
    contactId: optionalId(),
    projectId: optionalId(),

    currency: z.enum(CURRENCIES),
    issueDate: requiredDate("Pick an issue date"),
    dueDate: optionalDate(),

    taxRate: z
      .union([z.string(), z.number()])
      .transform((value, ctx) => {
        const raw = typeof value === "number" ? value : Number(String(value).trim() || "0");
        if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
          ctx.addIssue({ code: "custom", message: "Tax must be between 0 and 100" });
          return z.NEVER;
        }
        return Math.round(raw * 100) / 100;
      }),
    taxLabel: optionalText(40, "That label is too long"),

    notes: optionalText(2000, "That note is too long"),
    terms: optionalText(2000, "That is too long"),

    items: z.array(invoiceItemSchema).min(1, "An invoice needs at least one line"),
  })
  .refine(
    (value) => !value.dueDate || value.dueDate >= value.issueDate,
    { message: "The due date cannot be before the issue date", path: ["dueDate"] },
  );

export type InvoiceValues = z.output<typeof invoiceSchema>;
export type InvoiceInput = z.input<typeof invoiceSchema>;

export const updateInvoiceSchema = z.object({
  id: z.uuid(),
  values: invoiceSchema,
});

export const setInvoiceStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(INVOICE_STATUSES),
});

export const deleteInvoiceSchema = z.object({
  id: z.uuid(),
  deleted: z.boolean(),
});

export const invoiceFiltersSchema = z.object({
  q: optionalText(120, "That search is too long"),
  status: z.enum(INVOICE_STATUSES).optional(),
  brandId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export type InvoiceFilters = z.output<typeof invoiceFiltersSchema>;

export const PAGE_SIZE = 50;

/**
 * The letterhead, frozen onto an invoice when it stops being a draft.
 *
 * Stored as jsonb rather than columns because it is a copy of a document, not
 * data to query: nothing filters invoices by the address they were issued from.
 */
export interface IssuerSnapshot {
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  bankDetails: string | null;
  taxId: string | null;
  logoPath: string | null;
}

export interface ClientSnapshot {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

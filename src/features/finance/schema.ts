import { z } from "zod";

import { parseTakaToPoisha } from "@/lib/money";
import { optionalId, optionalText } from "@/lib/zod";

export const TRANSACTION_KINDS = ["income", "expense"] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const TRANSACTION_KIND_LABELS: Record<TransactionKind, string> = {
  income: "Income",
  expense: "Expense",
};

export const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "card",
  "mobile_banking",
  "cheque",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card: "Card",
  mobile_banking: "Mobile banking",
  cheque: "Cheque",
  other: "Other",
};

/** Report granularity. These strings are passed to Postgres `date_trunc`. */
export const BUCKETS = ["week", "month", "year"] as const;
export type Bucket = (typeof BUCKETS)[number];

export const BUCKET_LABELS: Record<Bucket, string> = {
  week: "Weekly",
  month: "Monthly",
  year: "Yearly",
};

/**
 * Amount arrives as whatever someone typed and leaves as integer poisha.
 *
 * The output is a number, so re-parsing it has to work too — a form submits
 * the resolver's output and the action re-validates it. `z.union` with a
 * number member is what makes `parse(parse(x))` hold, which `verify:schemas`
 * asserts.
 */
const amountPoisha = () =>
  z
    .union([z.string(), z.number()])
    .transform((value, ctx) => {
      const poisha =
        typeof value === "number" ? Math.round(value) : parseTakaToPoisha(value);

      if (poisha === null) {
        ctx.addIssue({ code: "custom", message: "Enter an amount, like 2500" });
        return z.NEVER;
      }
      if (poisha <= 0) {
        ctx.addIssue({ code: "custom", message: "The amount must be above zero" });
        return z.NEVER;
      }
      if (poisha > 1_000_000_000_000) {
        ctx.addIssue({ code: "custom", message: "That amount is too large" });
        return z.NEVER;
      }
      return poisha;
    });

/** A `date` input sends "" when cleared, which is not a date. */
const requiredDate = () =>
  z
    .string()
    .trim()
    .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), "Pick a date");

export const transactionSchema = z.object({
  kind: z.enum(TRANSACTION_KINDS),
  amount: amountPoisha(),
  occurredOn: requiredDate(),
  categoryId: optionalId(),
  brandId: optionalId(),
  projectId: optionalId(),
  contactId: optionalId(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  reference: optionalText(200, "That reference is too long"),
  description: optionalText(2000, "That description is too long"),
});

export type TransactionValues = z.output<typeof transactionSchema>;
export type TransactionInput = z.input<typeof transactionSchema>;

export const updateTransactionSchema = transactionSchema.extend({
  id: z.uuid(),
});

export const deleteTransactionSchema = z.object({
  id: z.uuid(),
  deleted: z.boolean(),
});

export const categorySchema = z.object({
  kind: z.enum(TRANSACTION_KINDS),
  name: z
    .string()
    .max(60, "That name is too long")
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, "Give the category a name"),
});

export const transactionFiltersSchema = z.object({
  q: optionalText(120, "That search is too long"),
  kind: z.enum(TRANSACTION_KINDS).optional(),
  categoryId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  brandId: z.uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export type TransactionFilters = z.output<typeof transactionFiltersSchema>;

export const reportFiltersSchema = z.object({
  bucket: z.enum(BUCKETS).default("month"),
  /** How far back the report reaches, in whole buckets. */
  range: z.coerce.number().int().min(3).max(36).default(12),
});

export type ReportFilters = z.output<typeof reportFiltersSchema>;

export const PAGE_SIZE = 50;

/** Granting or revoking the module for one user. */
export const financeAccessSchema = z.object({
  id: z.uuid(),
  granted: z.boolean(),
});

/** How many ledger rows the finance page shows before you ask for more. */
export const LEDGER_INITIAL = 10;
export const LEDGER_STEP = 20;

export const loadMoreSchema = z.object({
  offset: z.coerce.number().int().min(0).max(100000),
  limit: z.coerce.number().int().min(1).max(100),
});

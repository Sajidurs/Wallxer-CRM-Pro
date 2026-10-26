import { z } from "zod";

import { CURRENCIES, parseAmountToMinor } from "@/lib/money";
import { optionalId, optionalText } from "@/lib/zod";

export const PROPOSAL_STATUSES = ["draft", "sent", "accepted", "declined"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
};

/**
 * The body of a proposal, as six named sections rather than one text box.
 *
 * A blank section is simply not printed, so the structure is a prompt rather
 * than an obligation — somebody writing a one-paragraph proposal fills in
 * Overview and leaves the rest alone, and the document still reads properly.
 *
 * The order here is the order on the page and in the form, so there is one
 * place to change it.
 */
export const PROPOSAL_SECTIONS = [
  {
    key: "overview",
    label: "Overview",
    hint: "What the client asked for, in their words.",
    rows: 5,
  },
  {
    key: "scope",
    label: "Scope of work",
    hint: "What is included — and, just as usefully, what is not.",
    rows: 6,
  },
  {
    key: "deliverables",
    label: "Deliverables",
    hint: "What they actually receive at the end.",
    rows: 5,
  },
  {
    key: "timeline",
    label: "Timeline",
    hint: "Phases and rough dates.",
    rows: 4,
  },
  {
    key: "investment",
    label: "Investment",
    hint: "Anything to say about the pricing below. The figures come from the lines.",
    rows: 4,
  },
  {
    key: "terms",
    label: "Terms",
    hint: "Payment schedule, revisions, what happens if things change.",
    rows: 4,
  },
] as const;

export type ProposalSectionKey = (typeof PROPOSAL_SECTIONS)[number]["key"];

/**
 * Money in, as minor units out.
 *
 * The number member on the union is what makes `parse(parse(x))` hold: the form
 * submits the resolver's output, and the action re-validates that output.
 */
const amountMinor = (label: string) =>
  z.union([z.string(), z.number()]).transform((value, ctx) => {
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
  z.union([z.string(), z.number()]).transform((value, ctx) => {
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

export const proposalItemSchema = z.object({
  description: z
    .string()
    .max(300, "That description is too long")
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, "Describe the line"),
  quantity: quantity(),
  unitAmount: amountMinor("a rate"),
});

export type ProposalItemInput = z.input<typeof proposalItemSchema>;

export const proposalSchema = z
  .object({
    brandId: z.uuid("Choose which company is proposing this"),
    contactId: z.uuid("Choose the client this goes to"),
    projectId: optionalId(),

    title: z
      .string()
      .max(160, "That title is too long")
      .transform((value) => value.trim())
      .refine((value) => value.length > 0, "Give the proposal a title"),

    currency: z.enum(CURRENCIES),
    issueDate: requiredDate("Pick a date"),
    validUntil: optionalDate(),

    overview: optionalText(4000, "That section is too long"),
    scope: optionalText(4000, "That section is too long"),
    deliverables: optionalText(4000, "That section is too long"),
    timeline: optionalText(4000, "That section is too long"),
    investment: optionalText(4000, "That section is too long"),
    terms: optionalText(4000, "That section is too long"),

    taxRate: z.union([z.string(), z.number()]).transform((value, ctx) => {
      const raw =
        typeof value === "number" ? value : Number(String(value).trim() || "0");
      if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
        ctx.addIssue({ code: "custom", message: "Tax must be between 0 and 100" });
        return z.NEVER;
      }
      return Math.round(raw * 100) / 100;
    }),
    taxLabel: optionalText(40, "That label is too long"),

    // Unlike an invoice, a proposal can legitimately have no priced lines —
    // a retainer discussion, or pricing agreed elsewhere. An empty table just
    // does not print.
    items: z.array(proposalItemSchema),
  })
  .refine((value) => !value.validUntil || value.validUntil >= value.issueDate, {
    message: "The expiry date cannot be before the proposal date",
    path: ["validUntil"],
  });

export type ProposalValues = z.output<typeof proposalSchema>;
export type ProposalInput = z.input<typeof proposalSchema>;

export const updateProposalSchema = z.object({
  id: z.uuid(),
  values: proposalSchema,
});

export const setProposalStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(PROPOSAL_STATUSES),
});

export const deleteProposalSchema = z.object({
  id: z.uuid(),
  deleted: z.boolean(),
});

export const proposalFiltersSchema = z.object({
  q: optionalText(120, "That search is too long"),
  status: z.enum(PROPOSAL_STATUSES).optional(),
  brandId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export type ProposalFilters = z.output<typeof proposalFiltersSchema>;

export const PAGE_SIZE = 50;

/**
 * The letterhead, frozen onto a proposal when it stops being a draft.
 *
 * Same shape as the invoice snapshot on purpose: an accepted proposal already
 * holds everything an invoice needs, so converting one later is a copy rather
 * than a re-read of details that may have changed in between.
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

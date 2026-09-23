import { z } from "zod";

export const CONTACT_TYPES = ["person", "company"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const CONTACT_STATUSES = ["lead", "active", "inactive", "archived"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const STATUS_LABELS: Record<ContactStatus, string> = {
  lead: "Lead",
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
};

export const TYPE_LABELS: Record<ContactType, string> = {
  person: "Person",
  company: "Company",
};

/** Suggestions, not a constraint. The column is free text on purpose. */
export const COMMON_SOURCES = [
  "Referral",
  "Website",
  "Cold email",
  "Cold call",
  "Social media",
  "Event",
  "Existing client",
] as const;

/** Empty inputs arrive as "" from the form; the database wants null. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .max(max, message)
    .optional()
    .transform((value) => value?.trim() || null);

export const addressSchema = z.object({
  street: optionalText(200, "That street is too long"),
  city: optionalText(100, "That city is too long"),
  state: optionalText(100, "That state is too long"),
  country: optionalText(100, "That country is too long"),
  postal: optionalText(30, "That postal code is too long"),
});

export const contactSchema = z
  .object({
    type: z.enum(CONTACT_TYPES),

    firstName: optionalText(100, "That first name is too long"),
    lastName: optionalText(100, "That last name is too long"),
    companyName: optionalText(200, "That company name is too long"),
    jobTitle: optionalText(120, "That job title is too long"),

    // Not z.email(): an empty field is valid, and a contact with only a phone
    // number is a normal thing to have.
    email: z
      .string()
      .max(200, "That email is too long")
      .optional()
      .transform((value) => value?.trim().toLowerCase() || null)
      .refine(
        (value) => value === null || z.email().safeParse(value).success,
        "Enter a valid email address",
      ),

    phone: optionalText(40, "That phone number is too long"),
    whatsapp: optionalText(40, "That number is too long"),
    website: optionalText(200, "That URL is too long"),

    brandId: z.uuid().nullable().optional().transform((v) => v ?? null),
    ownerId: z.uuid().nullable().optional().transform((v) => v ?? null),
    parentContactId: z.uuid().nullable().optional().transform((v) => v ?? null),

    status: z.enum(CONTACT_STATUSES),
    source: optionalText(80, "That source is too long"),
    tags: z.array(z.string().min(1).max(40)).max(25, "That is a lot of tags").default([]),
    notes: optionalText(5000, "Those notes are too long"),

    address: addressSchema.default({
      street: null,
      city: null,
      state: null,
      country: null,
      postal: null,
    }),
  })
  // Mirrors the contacts_name_present check constraint. Catching it here turns
  // a database error into a message pointing at the field that is empty.
  .refine(
    (values) =>
      values.type !== "person" || !!(values.firstName || values.lastName),
    { message: "Enter a first or last name", path: ["firstName"] },
  )
  .refine((values) => values.type !== "company" || !!values.companyName, {
    message: "Enter the company name",
    path: ["companyName"],
  });

export type ContactInput = z.input<typeof contactSchema>;
export type ContactValues = z.output<typeof contactSchema>;

export const createContactSchema = contactSchema;
export const updateContactSchema = z.object({
  id: z.uuid(),
  values: contactSchema,
});

export const deleteContactSchema = z.object({
  id: z.uuid(),
  /** False restores it. */
  deleted: z.boolean().default(true),
});

/** Query string state for the list. Everything optional, everything bounded. */
export const contactFiltersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  type: z.enum(CONTACT_TYPES).optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
  brandId: z.uuid().optional(),
  ownerId: z.uuid().optional(),
  tag: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  sort: z.enum(["recent", "name", "updated"]).default("recent"),
});

export type ContactFilters = z.output<typeof contactFiltersSchema>;

export const PAGE_SIZE = 25;

/** The one place that decides how a contact is named in the UI. */
export function displayName(contact: {
  type: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
}): string {
  if (contact.type === "company") {
    return contact.company_name ?? "Unnamed company";
  }
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
  return name || contact.company_name || "Unnamed contact";
}

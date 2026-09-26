import { z } from "zod";

import { optionalText } from "@/lib/zod";

/**
 * A brand is the company an invoice is issued from, so it carries a letterhead
 * as well as a name and a colour. Everything below the name is optional — a
 * brand used only for tagging never needs an address.
 */
export const brandSchema = z.object({
  name: z
    .string()
    .max(80, "That name is too long")
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, "Give the company a name"),

  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour")
    .transform((value) => value.toLowerCase()),

  legalName: optionalText(120, "That name is too long"),
  email: z
    .string()
    .nullish()
    .transform((value) => value?.trim() || null)
    .refine(
      (value) => value === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
      "That email does not look right",
    ),
  phone: optionalText(40, "That phone number is too long"),
  website: z
    .string()
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim();
      if (!trimmed) return null;
      // Someone typing "wallxer.com" means https://wallxer.com, and an invoice
      // showing a bare domain is fine either way.
      return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    })
    .refine(
      (value) => value === null || value.length <= 200,
      "That address is too long",
    ),
  address: optionalText(400, "That address is too long"),
  bankDetails: optionalText(600, "That is too long for the bank block"),
  taxId: optionalText(60, "That tax id is too long"),

  invoicePrefix: z
    .string()
    .nullish()
    .transform((value) => value?.trim().toUpperCase() || null)
    .refine(
      (value) => value === null || /^[A-Z0-9]{2,8}$/.test(value),
      "Two to eight letters or digits, like WLX",
    ),

  isActive: z.boolean(),
});

export type BrandValues = z.output<typeof brandSchema>;
export type BrandInput = z.input<typeof brandSchema>;

export const updateBrandSchema = brandSchema.extend({ id: z.uuid() });

export const deleteBrandSchema = z.object({ id: z.uuid() });

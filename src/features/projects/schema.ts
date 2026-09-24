import { z } from "zod";

import { optionalId, optionalText } from "@/lib/zod";

export const PROJECT_STATUSES = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const ENVIRONMENTS = ["live", "staging", "dev", "admin"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const ENVIRONMENT_LABELS: Record<Environment, string> = {
  live: "Live",
  staging: "Staging",
  dev: "Development",
  admin: "Admin panel",
};

/** A date input sends "" when cleared, which is not a date. */
const optionalDate = () =>
  z
    .string()
    .nullish()
    .transform((value) => value?.trim() || null)
    .refine(
      (value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value),
      "Use the date picker",
    );

export const projectSchema = z
  .object({
    name: z
      .string()
      .min(2, "Give the project a name")
      .max(160, "That name is too long")
      .transform((value) => value.trim()),
    code: optionalText(30, "That code is too long"),
    description: optionalText(5000, "That description is too long"),
    status: z.enum(PROJECT_STATUSES),
    contactId: optionalId(),
    brandId: optionalId(),
    ownerId: optionalId(),
    startDate: optionalDate(),
    dueDate: optionalDate(),
  })
  // Mirrors the projects_dates_ordered check constraint, so the user sees which
  // field is wrong instead of a raw constraint violation.
  .refine(
    (values) =>
      !values.startDate || !values.dueDate || values.dueDate >= values.startDate,
    { message: "The due date cannot be before the start date", path: ["dueDate"] },
  );

export type ProjectInput = z.input<typeof projectSchema>;
export type ProjectValues = z.output<typeof projectSchema>;

export const createProjectSchema = projectSchema;

export const updateProjectSchema = z.object({
  id: z.uuid(),
  values: projectSchema,
});

export const deleteProjectSchema = z.object({
  id: z.uuid(),
  deleted: z.boolean().default(true),
});

export const websiteSchema = z.object({
  projectId: z.uuid(),
  label: z
    .string()
    .min(1, "Give the URL a label")
    .max(80, "That label is too long")
    .transform((value) => value.trim()),
  url: z
    .string()
    .min(1, "Enter the URL")
    .max(500, "That URL is too long")
    .transform((value) => {
      const trimmed = value.trim();
      // People paste "example.com". The check constraint requires a scheme, so
      // add the one they meant rather than rejecting it.
      return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    })
    .refine((value) => /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(value), "That does not look like a URL"),
  environment: z.enum(ENVIRONMENTS),
  notes: optionalText(500, "Those notes are too long"),
});

export type WebsiteInput = z.input<typeof websiteSchema>;
export type WebsiteValues = z.output<typeof websiteSchema>;

export const deleteWebsiteSchema = z.object({ id: z.uuid() });

export const projectFiltersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  brandId: z.uuid().optional(),
  ownerId: z.uuid().optional(),
  contactId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  sort: z.enum(["recent", "name", "due"]).default("recent"),
});

export type ProjectFilters = z.output<typeof projectFiltersSchema>;

export const PAGE_SIZE = 25;

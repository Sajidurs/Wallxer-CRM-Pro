import { z } from "zod";

import { optionalText } from "@/lib/zod";

export const USER_ROLES = ["super_admin", "admin", "manager", "member"] as const;

export const ROLE_LABELS: Record<(typeof USER_ROLES)[number], string> = {
  super_admin: "Super admin",
  admin: "Admin",
  manager: "Manager",
  member: "Member",
};

export const ROLE_DESCRIPTIONS: Record<(typeof USER_ROLES)[number], string> = {
  super_admin: "Everything, including changing roles and removing other admins.",
  admin: "Everything except changing roles.",
  manager: "Full access to contacts, pipeline, projects, and tasks. No user management.",
  member: "Read everything, create and edit records, edit only their own tasks.",
};

export const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  invited: "Invited",
  suspended: "Suspended",
};

/**
 * How a new account is delivered.
 *
 * `email` sends a Supabase invite, which needs working SMTP. `password`
 * generates a temporary password for the admin to hand over directly, which
 * needs nothing. See the Decision Log entry for 2026-09-24.
 */
export const DELIVERY_METHODS = ["email", "password"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const inviteUserSchema = z.object({
  email: z.email("Enter a valid email address").transform((v) => v.trim().toLowerCase()),
  fullName: z
    .string()
    .min(2, "Enter their full name")
    .max(120, "That name is too long")
    .transform((v) => v.trim()),
  role: z.enum(USER_ROLES),
  jobTitle: optionalText(120, "That job title is too long"),
  delivery: z.enum(DELIVERY_METHODS),
});

export type InviteUserInput = z.input<typeof inviteUserSchema>;
export type InviteUserValues = z.output<typeof inviteUserSchema>;

export const changeRoleSchema = z.object({
  userId: z.uuid(),
  role: z.enum(USER_ROLES),
});

export const setStatusSchema = z.object({
  userId: z.uuid(),
  status: z.enum(["active", "suspended"]),
});

export const resetPasswordSchema = z.object({
  userId: z.uuid(),
});

export const updateOwnProfileSchema = z.object({
  fullName: z
    .string()
    .min(2, "Enter your full name")
    .max(120, "That name is too long")
    .transform((v) => v.trim()),
  // nullish, not optional: these produce null, and the server re-parses the
  // output the form submits. See lib/zod.ts.
  phone: optionalText(40, "That phone number is too long"),
  jobTitle: optionalText(120, "That job title is too long"),
  timezone: z.string().min(1, "Pick a timezone").max(64),
});

/**
 * Input and output differ because the schema trims and turns empty strings into
 * null. The form is typed on the input, the action receives the output, and
 * `useForm` needs both — see the three-parameter generic in ProfileForm.
 */
export type UpdateOwnProfileInput = z.input<typeof updateOwnProfileSchema>;
export type UpdateOwnProfileValues = z.output<typeof updateOwnProfileSchema>;

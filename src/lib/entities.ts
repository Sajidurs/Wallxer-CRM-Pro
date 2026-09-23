/**
 * The registry the polymorphic subsystems validate against.
 *
 * `entity_type` is plain text in the database on purpose: adding a module must
 * not mean altering a type that four tables depend on. This array is where the
 * allowed values actually live. Add `'invoice'` here and attachments, comments,
 * resource links, and the activity log accept invoices immediately.
 *
 * See SYSTEM_DESIGN.md section 5.7.
 */
export const ENTITY_TYPES = [
  "contact",
  "deal",
  "project",
  "task",
  "credential",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export function isEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value);
}

/** Singular label for UI, and the base of the route an entity lives at. */
export const ENTITY_LABELS: Record<EntityType, string> = {
  contact: "Contact",
  deal: "Deal",
  project: "Project",
  task: "Task",
  credential: "Credential",
};

export const ENTITY_ROUTES: Record<EntityType, string> = {
  contact: "/contacts",
  deal: "/pipeline",
  project: "/projects",
  task: "/tasks",
  credential: "/projects",
};

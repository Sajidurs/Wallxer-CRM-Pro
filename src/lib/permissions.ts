/**
 * UI affordances only.
 *
 * This file decides whether to render a Delete button. It does NOT decide
 * whether a delete succeeds — RLS policies do, in the database. The two must be
 * kept in sync, and when they disagree, the database wins and the UI has a bug.
 *
 * See SYSTEM_DESIGN.md section 4. When four roles stop being enough, add a
 * `role_permissions` table and make `can()` read from it; nothing else changes,
 * because policies already call helper functions rather than comparing role
 * strings inline.
 */

export type Role = "super_admin" | "admin" | "manager" | "member";
export type UserStatus = "active" | "invited" | "suspended";

export type Resource =
  | "contact"
  | "deal"
  | "project"
  | "task"
  | "credential"
  | "user"
  | "brand"
  | "pipeline"
  | "workspace";

export type Action = "view" | "create" | "update" | "delete" | "reveal";

/** Ordered weakest to strongest, so comparisons can use the index. */
const ROLE_RANK: Record<Role, number> = {
  member: 0,
  manager: 1,
  admin: 2,
  super_admin: 3,
};

export function atLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** Minimum role for each action, by resource. */
const RULES: Record<Resource, Partial<Record<Action, Role>>> = {
  contact: { view: "member", create: "member", update: "member", delete: "manager" },
  deal: { view: "member", create: "member", update: "member", delete: "manager" },
  project: { view: "member", create: "member", update: "member", delete: "manager" },
  // `update` on a task is intentionally permissive here; whether a member may
  // edit *this* task depends on assignment, which `canEditTask` answers.
  task: { view: "member", create: "member", update: "member", delete: "manager" },
  // Every active role may reveal a credential, by decision. Accountability
  // comes from credential_access_log, not from withholding access.
  // `delete` is manager, not admin, to match what the database actually
  // enforces in delete_credential. A manager can already delete the whole
  // project a credential hangs off, so withholding the smaller action only
  // created a UI that disagreed with the boundary.
  credential: { view: "member", create: "manager", update: "manager", delete: "manager", reveal: "member" },
  user: { view: "member", create: "admin", update: "admin", delete: "super_admin" },
  brand: { view: "member", create: "admin", update: "admin", delete: "admin" },
  pipeline: { view: "member", create: "admin", update: "admin", delete: "admin" },
  workspace: { view: "member", update: "admin" },
};

export interface PermissionSubject {
  id: string;
  role: Role;
  status: UserStatus;
}

export function can(
  user: Pick<PermissionSubject, "role" | "status"> | null | undefined,
  action: Action,
  resource: Resource,
): boolean {
  // Suspended and invited users have no workspace as far as the database is
  // concerned, so the UI should not offer them anything either.
  if (!user || user.status !== "active") return false;

  const minimum = RULES[resource][action];
  if (!minimum) return false;

  return atLeast(user.role, minimum);
}

/**
 * A member may edit only tasks assigned to them. Manager and above edit any.
 * Kept separate from `can` because it needs the record, not just the role.
 */
export function canEditTask(
  user: PermissionSubject | null | undefined,
  task: { assigneeIds: string[] },
): boolean {
  if (!can(user, "update", "task")) return false;
  if (!user) return false;
  if (atLeast(user.role, "manager")) return true;
  return task.assigneeIds.includes(user.id);
}

/** Admin and super admin reach Settings. Nobody else sees the nav entry. */
export function canManageSettings(
  user: Pick<PermissionSubject, "role" | "status"> | null | undefined,
): boolean {
  return can(user, "update", "user");
}

/**
 * Finance is a grant, not a rank.
 *
 * Roles here are cumulative, so expressing "the finance module" as a minimum
 * role would mean the only way to show it to a manager is to make them an
 * admin — which also hands them user management. Admins hold it implicitly;
 * everyone else holds it because an admin switched it on for them.
 *
 * This must agree with `has_finance_access()` in migration 0019, which is the
 * half that actually enforces it. When they disagree, the database wins and
 * this file has a bug.
 */
export function canAccessFinance(
  user:
    | (Pick<PermissionSubject, "role" | "status"> & { finance_access?: boolean })
    | null
    | undefined,
): boolean {
  if (!user || user.status !== "active") return false;
  return atLeast(user.role, "admin") || user.finance_access === true;
}

/** Only an admin may hand the finance module to someone else. */
export function canGrantFinance(
  user: Pick<PermissionSubject, "role" | "status"> | null | undefined,
): boolean {
  return can(user, "update", "user");
}

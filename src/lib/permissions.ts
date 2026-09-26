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
  // Members run the work: any task, not only the ones assigned to them, and
  // deleting one too. Migration 0021 removed the matching restriction from
  // `guard_task_edit`, which is the half that actually enforces it.
  task: { view: "member", create: "member", update: "member", delete: "member" },
  // Every active role may reveal a credential, by decision. Accountability
  // comes from credential_access_log, not from withholding access — and since
  // a member could already read the secret, withholding *writing* one only
  // meant they had to ask someone else to type it in. 0021 opened the three
  // functions to match.
  credential: { view: "member", create: "member", update: "member", delete: "member", reveal: "member" },
  // `view` is admin on all three so the Settings section does not appear in the
  // sidebar for anyone else. Every one of those routes already called
  // `requireRole("admin")`, so a member clicking through was only ever bounced
  // back — the nav was advertising doors that do not open.
  user: { view: "admin", create: "admin", update: "admin", delete: "super_admin" },
  brand: { view: "admin", create: "admin", update: "admin", delete: "admin" },
  pipeline: { view: "admin", create: "admin", update: "admin", delete: "admin" },
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

// `canEditTask` used to live here, restricting a member to tasks assigned to
// them. It went in 0021 along with the matching check in `guard_task_edit`: a
// member who could not tick a subtask on a colleague's task simply asked
// someone else to do it, which is an obstacle rather than a boundary. Callers
// now ask `can(user, "update", "task")`, and three of them stopped querying
// task_assignees to answer a question that no longer depends on it.

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

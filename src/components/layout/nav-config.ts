import {
  Building2,
  CheckSquare,
  FolderKanban,
  KanbanSquare,
  LayoutDashboard,
  Palette,
  Wallet,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import type { Resource } from "@/lib/permissions";

/**
 * The sidebar is data, not markup. Adding a module is one entry here plus the
 * route — see the module checklist in SYSTEM_DESIGN.md section 6.
 *
 * `resource` is checked against `can(user, 'view', resource)` so an entry the
 * user cannot open is never rendered.
 */
export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  resource: Resource;
  /** Shown greyed out with a note until the phase that builds it ships. */
  phase?: number;
  /**
   * Live count shown on the right of the row, Notion-style. Resolved by the
   * layout, which already reads most of these for other reasons.
   */
  countKey?: "contacts" | "projects" | "tasks" | "deals";
  /**
   * A per-user grant rather than a role, checked with its own helper. Finance
   * is the only one: `resource` cannot express it, because roles are
   * cumulative and the whole point is to hand the module to one manager
   * without also handing them user management.
   */
  grant?: "finance";
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Main menu",
    items: [
      {
        title: "Home",
        href: "/dashboard",
        icon: LayoutDashboard,
        resource: "workspace",
      },
      {
        title: "Contacts",
        href: "/contacts",
        icon: Users,
        resource: "contact",
        countKey: "contacts",
      },
      {
        title: "Pipeline",
        href: "/pipeline",
        icon: KanbanSquare,
        resource: "deal",
        countKey: "deals",
      },
      {
        title: "Projects",
        href: "/projects",
        icon: FolderKanban,
        resource: "project",
        countKey: "projects",
      },
      {
        title: "Tasks",
        href: "/tasks",
        icon: CheckSquare,
        resource: "task",
        countKey: "tasks",
      },
      {
        title: "Finance",
        href: "/finance",
        icon: Wallet,
        // `workspace` view is the weakest gate in the matrix; the real check is
        // the grant below, which every role must pass.
        resource: "workspace",
        grant: "finance",
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        title: "Users",
        href: "/settings/users",
        icon: UsersRound,
        resource: "user",
      },
      {
        title: "Brands",
        href: "/settings/brands",
        icon: Palette,
        resource: "brand",
        phase: 2,
      },
      {
        title: "Pipelines",
        href: "/settings/pipelines",
        icon: Building2,
        resource: "pipeline",
      },
    ],
  },
];

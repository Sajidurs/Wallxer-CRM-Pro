import {
  Building2,
  CheckSquare,
  FolderKanban,
  KanbanSquare,
  LayoutDashboard,
  Palette,
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

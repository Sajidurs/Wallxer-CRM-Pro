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
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Workspace",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        resource: "workspace",
      },
      {
        title: "Contacts",
        href: "/contacts",
        icon: Users,
        resource: "contact",
      },
      {
        title: "Pipeline",
        href: "/pipeline",
        icon: KanbanSquare,
        resource: "deal",
      },
      {
        title: "Projects",
        href: "/projects",
        icon: FolderKanban,
        resource: "project",
      },
      {
        title: "Tasks",
        href: "/tasks",
        icon: CheckSquare,
        resource: "task",
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

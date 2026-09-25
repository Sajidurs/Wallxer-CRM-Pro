import {
  AlertTriangle,
  CalendarClock,
  CheckSquare,
  FolderKanban,
  KanbanSquare,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Resource } from "@/lib/permissions";

import type { DashboardCounts } from "./queries";

/**
 * Widget rendering is driven by this array. Section 8.1: adding a widget should
 * be one entry plus a component, not an edit to the page's layout.
 */
export interface CounterConfig {
  key: keyof DashboardCounts;
  label: string;
  icon: LucideIcon;
  href: string;
  resource: Resource;
  /** Renders in red when non-zero — for counts that mean something is wrong. */
  alarming?: boolean;
  /** Shown under the number when the count is zero. */
  emptyHint: string;
}

export const COUNTERS: CounterConfig[] = [
  {
    key: "tasks_overdue",
    label: "Tasks overdue",
    icon: AlertTriangle,
    href: "/tasks?due=overdue",
    resource: "task",
    alarming: true,
    emptyHint: "Nothing is late",
  },
  {
    key: "tasks_due_today",
    label: "Due today",
    icon: CalendarClock,
    href: "/tasks?due=today",
    resource: "task",
    emptyHint: "Nothing due today",
  },
  {
    key: "open_deals",
    label: "Open deals",
    icon: KanbanSquare,
    href: "/pipeline",
    resource: "deal",
    emptyHint: "No deals in flight",
  },
  {
    key: "active_projects",
    label: "Active projects",
    icon: FolderKanban,
    href: "/projects?status=active",
    resource: "project",
    emptyHint: "Nothing active",
  },
  {
    key: "contacts",
    label: "Contacts",
    icon: Users,
    href: "/contacts",
    resource: "contact",
    emptyHint: "No contacts yet",
  },
];

/** Phrasing for the activity feed, per entity and action. */
export const ENTITY_LABELS: Record<string, string> = {
  contact: "contact",
  project: "project",
  task: "task",
  deal: "deal",
  credential: "credential",
};

export const ACTION_VERBS: Record<string, string> = {
  created: "created",
  updated: "updated",
  deleted: "deleted",
  restored: "restored",
  status_changed: "changed the status of",
};

export const ENTITY_HREF: Record<string, (id: string) => string> = {
  contact: (id) => `/contacts/${id}`,
  project: (id) => `/projects/${id}`,
  task: (id) => `/tasks/${id}`,
  deal: (id) => `/pipeline/${id}`,
  credential: () => "/projects",
};

export const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  contact: Users,
  project: FolderKanban,
  task: CheckSquare,
  deal: KanbanSquare,
  credential: FolderKanban,
};

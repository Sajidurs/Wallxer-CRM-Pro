import { format, isPast } from "date-fns";
import { Folder } from "lucide-react";
import Link from "next/link";

import { Pill, TONE_CLASSES, type PillTone } from "@/components/common/pill";
import type { BrandOption } from "@/features/brands/queries";
import type { UserOption } from "@/features/users/queries";
import { cn } from "@/lib/utils";

import type { ProjectListItem } from "../queries";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "../schema";
import { ProjectCardActions } from "./project-card-actions";

interface ProjectsGridProps {
  projects: ProjectListItem[];
  brands: BrandOption[];
  owners: UserOption[];
  clients: { id: string; name: string }[];
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Projects as cards rather than rows.
 *
 * A project is a container — websites, credentials, files — so it reads like a
 * folder, and the reference's file-manager card is the right shape for it. The
 * card carries the four things you need to triage one: what it is, who it is
 * for, when it is due, and what state it is in.
 */

const STATUS_TONE: Record<ProjectStatus, PillTone> = {
  planning: "grey",
  active: "blue",
  on_hold: "amber",
  completed: "green",
  cancelled: "red",
};

/** Two letters from a name, for the owner chip in the card's corner. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ProjectsGrid({
  projects,
  brands,
  owners,
  clients,
  canEdit,
  canDelete,
}: ProjectsGridProps) {
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const clientById = new Map(clients.map((c) => [c.id, c]));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {projects.map((project) => {
        const brand = project.brand_id ? brandById.get(project.brand_id) : null;
        const owner = project.owner_id ? ownerById.get(project.owner_id) : null;
        const client = project.contact_id
          ? clientById.get(project.contact_id)
          : null;

        const status = (project.status as ProjectStatus) ?? "planning";
        const tone = STATUS_TONE[status] ?? "grey";

        // Overdue only matters while the work is still live. A completed
        // project with a past due date is just finished.
        const overdue =
          project.due_date &&
          isPast(new Date(project.due_date)) &&
          (status === "active" || status === "planning");

        return (
          <div
            key={project.id}
            className="group relative flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-md focus-within:shadow-md"
          >
            <div className="flex items-start justify-between">
              {/* The icon tile is tinted by status, the way the reference
                  tints by file type — colour carries the category. */}
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  TONE_CLASSES[tone],
                )}
              >
                <Folder className="size-4.5" />
              </div>

              <div className="relative z-10 -mt-1 -mr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <ProjectCardActions
                  projectId={project.id}
                  name={project.name}
                  canEdit={canEdit}
                  canDelete={canDelete}
                />
              </div>
            </div>

            <div className="mt-3 min-w-0 flex-1">
              {/* The whole card is the hit target, via an overlay link, so a
                  card is as easy to open as a folder. */}
              <Link
                href={`/projects/${project.id}`}
                className="text-[15px] font-semibold leading-snug after:absolute after:inset-0 after:content-[''] group-hover:underline"
              >
                <span className="line-clamp-2">{project.name}</span>
              </Link>

              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                {brand && (
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: brand.color }}
                    aria-hidden
                  />
                )}
                <span className="truncate">{client?.name ?? "No client"}</span>
              </p>

              {project.code && (
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground/70">
                  {project.code}
                </p>
              )}
            </div>

            <div className="mt-4 flex items-end justify-between gap-2">
              <div className="min-w-0 space-y-1.5">
                <Pill tone={tone} dot>
                  {PROJECT_STATUS_LABELS[status] ?? project.status}
                </Pill>
                <p
                  className={cn(
                    "truncate text-xs",
                    overdue
                      ? "font-medium text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {project.due_date
                    ? `Due ${format(new Date(project.due_date), "d MMM yyyy")}${overdue ? " · overdue" : ""}`
                    : "No due date"}
                </p>
              </div>

              {owner && (
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar text-[11px] font-semibold text-muted-foreground ring-1 ring-border"
                  title={owner.name}
                >
                  {initials(owner.name)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

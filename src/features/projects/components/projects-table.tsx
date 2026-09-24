import { format, isPast } from "date-fns";
import { FolderKanban } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BrandOption } from "@/features/brands/queries";
import type { UserOption } from "@/features/users/queries";

import type { ProjectListItem } from "../queries";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "../schema";

interface ProjectsTableProps {
  projects: ProjectListItem[];
  brands: BrandOption[];
  owners: UserOption[];
  clients: { id: string; name: string }[];
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  planning: "outline",
  active: "default",
  on_hold: "secondary",
  completed: "secondary",
  cancelled: "outline",
};

export function ProjectsTable({
  projects,
  brands,
  owners,
  clients,
}: ProjectsTableProps) {
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const clientById = new Map(clients.map((c) => [c.id, c]));

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead className="hidden md:table-cell">Client</TableHead>
            <TableHead className="hidden lg:table-cell">Brand</TableHead>
            <TableHead className="hidden lg:table-cell">Owner</TableHead>
            <TableHead className="hidden sm:table-cell">Due</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => {
            const brand = project.brand_id ? brandById.get(project.brand_id) : null;
            const owner = project.owner_id ? ownerById.get(project.owner_id) : null;
            const client = project.contact_id
              ? clientById.get(project.contact_id)
              : null;

            // Overdue only matters while the work is still live. A completed
            // project with a past due date is just finished.
            const overdue =
              project.due_date &&
              isPast(new Date(project.due_date)) &&
              (project.status === "active" || project.status === "planning");

            return (
              <TableRow key={project.id}>
                <TableCell>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      <FolderKanban className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium hover:underline"
                      >
                        {project.name}
                      </Link>
                      {project.code && (
                        <div className="font-mono text-xs text-muted-foreground">
                          {project.code}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>

                <TableCell className="hidden md:table-cell">
                  {client ? (
                    <Link
                      href={`/contacts/${client.id}`}
                      className="text-sm hover:underline"
                    >
                      {client.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </TableCell>

                <TableCell className="hidden lg:table-cell">
                  {brand ? (
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: brand.color }}
                        aria-hidden
                      />
                      {brand.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </TableCell>

                <TableCell className="hidden text-sm lg:table-cell">
                  {owner?.name ?? (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>

                <TableCell className="hidden sm:table-cell">
                  {project.due_date ? (
                    <span
                      className={
                        overdue ? "text-sm font-medium text-destructive" : "text-sm"
                      }
                    >
                      {format(new Date(project.due_date), "d MMM yyyy")}
                      {overdue && " · overdue"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </TableCell>

                <TableCell>
                  <Badge variant={STATUS_VARIANT[project.status] ?? "outline"}>
                    {PROJECT_STATUS_LABELS[project.status as ProjectStatus] ??
                      project.status}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

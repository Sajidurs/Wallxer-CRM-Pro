import { CheckSquare, FolderKanban, KanbanSquare, Users } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Phase 0 shell. The real widgets arrive in Phase 6, reading Postgres views so
 * the numbers can never drift from the modules they summarise.
 */
const PLACEHOLDER_COUNTERS = [
  { label: "Active projects", icon: FolderKanban, phase: 3 },
  { label: "Open deals", icon: KanbanSquare, phase: 5 },
  { label: "Contacts", icon: Users, phase: 2 },
  { label: "Tasks due today", icon: CheckSquare, phase: 4 },
];

export default async function DashboardPage() {
  const profile = await requireUser();

  const firstName = profile.full_name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description="Your workspace is set up. The modules below arrive phase by phase."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLACEHOLDER_COUNTERS.map((counter) => (
          <Card key={counter.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {counter.label}
              </CardTitle>
              <counter.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-muted-foreground">
                &mdash;
              </div>
              <CardDescription className="text-xs">
                Phase {counter.phase}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      <EmptyState
        title="Nothing to show yet"
        description="Recent activity, your tasks, and the pipeline summary land in Phase 6, once the modules that feed them exist."
      />
    </>
  );
}

import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityFeed } from "@/features/dashboard/components/activity-feed";
import { MyTasks } from "@/features/dashboard/components/my-tasks";
import { PipelineSummary } from "@/features/dashboard/components/pipeline-summary";
import {
  getCounts,
  getDealsByStage,
  getMyTasks,
  getProjectsAtRisk,
  getRecentActivity,
} from "@/features/dashboard/queries";
import { COUNTERS } from "@/features/dashboard/widgets";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const profile = await requireUser();

  const [counts, stages, atRisk, activity, myTasks] = await Promise.all([
    getCounts(),
    getDealsByStage(),
    getProjectsAtRisk(),
    getRecentActivity(20),
    getMyTasks(profile.id),
  ]);

  const firstName = profile.full_name.split(" ")[0];

  // A counter for a module this role cannot open would be a number they can
  // read and not act on.
  const visibleCounters = COUNTERS.filter((counter) =>
    can(profile, "view", counter.resource),
  );

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description="What needs attention, across every brand."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {visibleCounters.map((counter) => {
          const value = counts[counter.key];
          const alarming = counter.alarming && value > 0;

          return (
            <Link key={counter.key} href={counter.href} className="group">
              <Card className="h-full transition-colors group-hover:border-foreground/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {counter.label}
                  </CardTitle>
                  <counter.icon
                    className={`size-4 ${alarming ? "text-destructive" : "text-muted-foreground"}`}
                  />
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-2xl font-semibold ${alarming ? "text-destructive" : ""}`}
                  >
                    {value}
                  </div>
                  {value === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {counter.emptyHint}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ActivityFeed entries={activity} />
        </div>

        <div className="space-y-4">
          <MyTasks tasks={myTasks} userId={profile.id} />

          {can(profile, "view", "deal") && <PipelineSummary stages={stages} />}

          {atRisk.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="size-4 text-destructive" />
                  Projects at risk
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {atRisk.map((project) => (
                    <li key={project.id} className="py-2">
                      <Link
                        href={`/projects/${project.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {project.name}
                      </Link>
                      <p className="text-xs text-destructive">
                        Due {format(new Date(project.due_date), "d MMM yyyy")} ·{" "}
                        {project.days_overdue}{" "}
                        {project.days_overdue === 1 ? "day" : "days"} overdue
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

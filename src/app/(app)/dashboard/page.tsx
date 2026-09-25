import { format, isPast } from "date-fns";
import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityFeed } from "@/features/dashboard/components/activity-feed";
import { AttentionCard } from "@/features/dashboard/components/attention-card";
import { MyTasks } from "@/features/dashboard/components/my-tasks";
import { PipelineSummary } from "@/features/dashboard/components/pipeline-summary";
import { StatStrip } from "@/features/dashboard/components/stat-strip";
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
  title: "Home",
};

/** "Good morning" is a lie at 9pm. */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const profile = await requireUser();

  const [counts, stages, atRisk, activity, myTasks] = await Promise.all([
    getCounts(),
    getDealsByStage(),
    getProjectsAtRisk(),
    getRecentActivity(12),
    getMyTasks(profile.id),
  ]);

  const firstName = profile.full_name.split(" ")[0];

  const visibleCounters = COUNTERS.filter((counter) =>
    can(profile, "view", counter.resource),
  );

  // The one thing worth surfacing above everything else: the most overdue
  // project if any are late, otherwise the next task due. Nothing at all if the
  // day is clear, because an empty callout is just noise with a border.
  const worstProject = atRisk[0];
  const nextTask = myTasks.find((task) => task.due_at);

  const attention = worstProject
    ? {
        label: "Needs attention · overdue",
        title: worstProject.name,
        meta: [
          `Due ${format(new Date(worstProject.due_date), "d MMM")}`,
          `${worstProject.days_overdue} ${worstProject.days_overdue === 1 ? "day" : "days"} late`,
        ],
        href: `/projects/${worstProject.id}`,
      }
    : nextTask
      ? {
          label:
            nextTask.due_at && isPast(new Date(nextTask.due_at))
              ? "Top priority · overdue"
              : "Next up",
          title: nextTask.title,
          meta: [
            nextTask.due_at
              ? `Due ${format(new Date(nextTask.due_at), "d MMM, HH:mm")}`
              : "No due date",
            nextTask.priority,
          ],
          href: `/tasks/${nextTask.id}`,
        }
      : null;

  const openTasks = myTasks.length;

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={
          openTasks === 0
            ? `${format(new Date(), "EEEE, d MMMM")} · nothing assigned to you right now`
            : `${format(new Date(), "EEEE, d MMMM")} · ${openTasks} ${openTasks === 1 ? "task needs" : "tasks need"} your attention`
        }
      />

      {visibleCounters.length > 0 && (
        <StatStrip counters={visibleCounters} counts={counts} />
      )}

      {attention && <AttentionCard {...attention} />}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <MyTasks tasks={myTasks} userId={profile.id} />
        </div>

        <div className="space-y-4 lg:col-span-2">
          {can(profile, "view", "deal") && <PipelineSummary stages={stages} />}

          {atRisk.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="size-4 text-destructive" />
                  Projects at risk
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {atRisk.map((project) => (
                    <li key={project.id} className="py-2 first:pt-0 last:pb-0">
                      <Link
                        href={`/projects/${project.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {project.name}
                      </Link>
                      <p className="text-xs text-destructive">
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

      <ActivityFeed entries={activity} />
    </>
  );
}

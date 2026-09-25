import { formatDistanceToNow } from "date-fns";
import { Activity } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { ActivityEntry } from "../queries";
import {
  ACTION_VERBS,
  ACTIVITY_ICONS,
  ENTITY_HREF,
  ENTITY_LABELS,
} from "../widgets";

interface ActivityFeedProps {
  entries: ActivityEntry[];
}

export function ActivityFeed({ entries }: ActivityFeedProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Every contact, project, task, and deal that changes from
            here on shows up in this feed.
          </p>
        ) : (
          <ol className="space-y-3">
            {entries.map((entry) => {
              const Icon = ACTIVITY_ICONS[entry.entity_type] ?? Activity;
              const label = (entry.changes.label as string | undefined) ?? "a record";
              const href = ENTITY_HREF[entry.entity_type]?.(entry.entity_id);
              const verb = ACTION_VERBS[entry.action] ?? entry.action;
              const from = entry.changes.from as string | undefined;
              const to = entry.changes.to as string | undefined;

              return (
                <li key={entry.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon className="size-3.5 text-muted-foreground" />
                  </div>

                  <div className="min-w-0">
                    <p>
                      <span className="font-medium">
                        {entry.actor_name ?? "Someone"}
                      </span>{" "}
                      {verb} {ENTITY_LABELS[entry.entity_type] ?? "record"}{" "}
                      {href ? (
                        <Link href={href} className="font-medium hover:underline">
                          {label}
                        </Link>
                      ) : (
                        <span className="font-medium">{label}</span>
                      )}
                      {entry.action === "status_changed" && from && to && (
                        <span className="text-muted-foreground">
                          {" "}
                          from {from} to {to}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(entry.created_at))} ago
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

import { format, isPast, isToday } from "date-fns";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { MyTask } from "../queries";

interface MyTasksProps {
  tasks: MyTask[];
  userId: string;
}

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  urgent: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};

export function MyTasks({ tasks, userId }: MyTasksProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">My tasks</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/tasks?assigneeId=${userId}`}>View all</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing assigned to you. Either you are on top of everything, or
            nobody has given you anything yet.
          </p>
        ) : (
          <ul className="divide-y">
            {tasks.map((task) => {
              const due = task.due_at ? new Date(task.due_at) : null;
              const overdue = due && isPast(due);

              return (
                <li key={task.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/tasks/${task.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {task.title}
                    </Link>
                    {due && (
                      <p
                        className={`text-xs ${
                          overdue ? "font-medium text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {isToday(due)
                          ? `Today, ${format(due, "HH:mm")}`
                          : format(due, "d MMM, HH:mm")}
                        {overdue && " · overdue"}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={PRIORITY_VARIANT[task.priority] ?? "outline"}
                    className="shrink-0"
                  >
                    {task.priority}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

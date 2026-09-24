"use client";

import { LayoutList, Search, SquareKanban, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from "../schema";

const ALL = "__all__";

interface Option {
  id: string;
  name: string;
}

interface TaskFiltersProps {
  people: Option[];
  projects: Option[];
  currentUserId: string;
}

export function TaskFilters({ people, projects, currentUserId }: TaskFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlQuery = searchParams.get("q") ?? "";
  const [search, setSearch] = useState(urlQuery);
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);

  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setSearch(urlQuery);
  }

  const view = searchParams.get("view") ?? "list";

  function apply(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "" || value === ALL) params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  const activeCount = ["q", "status", "priority", "assigneeId", "projectId", "due"].filter(
    (key) => searchParams.get(key),
  ).length;

  const mineActive = searchParams.get("assigneeId") === currentUserId;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            apply({ q: search });
          }}
          className="flex min-w-64 flex-1 gap-2"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search task titles"
              className="pl-8"
              aria-label="Search tasks"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={isPending}>
            Search
          </Button>
        </form>

        {/* The view toggle sits apart from the filters: it changes how the same
            results are drawn, not which results they are. */}
        <div className="flex rounded-md border p-0.5">
          <Button
            type="button"
            variant={view === "list" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => apply({ view: "list" })}
          >
            <LayoutList />
            List
          </Button>
          <Button
            type="button"
            variant={view === "board" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => apply({ view: "board" })}
          >
            <SquareKanban />
            Board
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={mineActive ? "secondary" : "outline"}
          size="sm"
          onClick={() => apply({ assigneeId: mineActive ? null : currentUserId })}
        >
          My tasks
        </Button>

        <Select
          value={searchParams.get("due") ?? ALL}
          onValueChange={(value) => apply({ due: value })}
        >
          <SelectTrigger className="w-36" aria-label="Filter by due date">
            <SelectValue placeholder="Due" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any time</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="today">Due today</SelectItem>
            <SelectItem value="week">Next 7 days</SelectItem>
            <SelectItem value="none">No due date</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("status") ?? ALL}
          onValueChange={(value) => apply({ status: value })}
        >
          <SelectTrigger className="w-36" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {TASK_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {TASK_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("priority") ?? ALL}
          onValueChange={(value) => apply({ priority: value })}
        >
          <SelectTrigger className="w-36" aria-label="Filter by priority">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All priorities</SelectItem>
            {TASK_PRIORITIES.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {TASK_PRIORITY_LABELS[priority]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("assigneeId") ?? ALL}
          onValueChange={(value) => apply({ assigneeId: value })}
        >
          <SelectTrigger className="w-40" aria-label="Filter by assignee">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Everyone</SelectItem>
            {people.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("projectId") ?? ALL}
          onValueChange={(value) => apply({ projectId: value })}
        >
          <SelectTrigger className="w-44" aria-label="Filter by project">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All projects</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {view === "list" && (
          <Select
            value={searchParams.get("sort") ?? "due"}
            onValueChange={(value) => apply({ sort: value })}
          >
            <SelectTrigger className="w-40" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due">Due soonest</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="recent">Newest first</SelectItem>
            </SelectContent>
          </Select>
        )}

        {activeCount > 0 && (
          <Button
            variant="ghost"
            onClick={() =>
              startTransition(() =>
                // The view is not a filter, so clearing filters keeps it.
                router.replace(`${pathname}?view=${view}`),
              )
            }
          >
            <X />
            Clear {activeCount}
          </Button>
        )}
      </div>
    </div>
  );
}

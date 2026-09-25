"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  addChecklistItem,
  removeChecklistItem,
  setChecklistItemDone,
} from "../actions";
import type { ChecklistItem } from "../queries";

interface TaskChecklistProps {
  taskId: string;
  items: ChecklistItem[];
  canEdit: boolean;
}

/**
 * The subtasks a task is broken into, and the source of the board's progress
 * bar. Ticking is optimistic: a checkbox that waits for Seoul before it moves
 * feels broken, and the only failure is a refusal the server will announce.
 */
export function TaskChecklist({ taskId, items, canEdit }: TaskChecklistProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [optimistic, setOptimistic] = useOptimistic(
    items,
    (current, change: { id: string; isDone: boolean }) =>
      current.map((item) =>
        item.id === change.id ? { ...item, is_done: change.isDone } : item,
      ),
  );

  const done = optimistic.filter((item) => item.is_done).length;
  const total = optimistic.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  function toggle(item: ChecklistItem, isDone: boolean) {
    startTransition(async () => {
      setOptimistic({ id: item.id, isDone });
      const result = await setChecklistItemDone({ id: item.id, isDone });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function add() {
    const value = title.trim();
    if (!value) return;

    startTransition(async () => {
      const result = await addChecklistItem({ taskId, title: value });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setTitle("");
      router.refresh();
      // Adding several in a row is the normal case, so the field keeps focus.
      inputRef.current?.focus();
    });
  }

  function remove(item: ChecklistItem) {
    startTransition(async () => {
      const result = await removeChecklistItem({ id: item.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {total > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {done} of {total} done
            </span>
            <span className="font-medium text-muted-foreground">{percent}%</span>
          </div>
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border"
            role="progressbar"
            aria-valuenow={done}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label={`${done} of ${total} subtasks done`}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {total === 0 && (
        <p className="text-sm text-muted-foreground">
          No subtasks yet. Breaking the work down here is what fills the
          progress bar on the board.
        </p>
      )}

      <ul className="divide-y">
        {optimistic.map((item) => (
          <li key={item.id} className="group flex items-center gap-2.5 py-2">
            <Checkbox
              id={`checklist-${item.id}`}
              checked={item.is_done}
              disabled={!canEdit}
              onCheckedChange={(checked) => toggle(item, checked === true)}
            />
            <label
              htmlFor={`checklist-${item.id}`}
              className={cn(
                "flex-1 text-sm leading-snug",
                canEdit && "cursor-pointer",
                item.is_done && "text-muted-foreground line-through",
              )}
            >
              {item.title}
            </label>

            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Remove ${item.title}`}
                disabled={isPending}
                onClick={() => remove(item)}
              >
                <X />
              </Button>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            placeholder="Add a subtask"
            maxLength={300}
            aria-label="New subtask"
          />
          <Button
            type="button"
            variant="outline"
            onClick={add}
            disabled={isPending || title.trim().length === 0}
          >
            <Plus />
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

"use client";

import { ChevronDown, ChevronUp, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { createStage, moveStage, updateStage } from "../actions";
import type { Pipeline, PipelineStage } from "../queries";

interface StageManagerProps {
  pipeline: Pipeline;
  stages: PipelineStage[];
}

function outcomeOf(stage: PipelineStage) {
  if (stage.is_won) return "won" as const;
  if (stage.is_lost) return "lost" as const;
  return "none" as const;
}

/**
 * Stage administration. Section 5.3: stages are data, so renaming, reordering,
 * adding, and archiving all happen here rather than in a migration.
 */
export function StageManager({ pipeline, stages }: StageManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PipelineStage | null>(null);

  const [name, setName] = useState("");
  const [color, setColor] = useState("#64748b");
  const [outcome, setOutcome] = useState<"none" | "won" | "lost">("none");

  function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(label);
        setAdding(false);
        setEditing(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "That did not work.");
      }
    });
  }

  function openAdd() {
    setName("");
    setColor("#64748b");
    setOutcome("none");
    setAdding(true);
  }

  function openEdit(stage: PipelineStage) {
    setName(stage.name);
    setColor(stage.color);
    setOutcome(outcomeOf(stage));
    setEditing(stage);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          {pipeline.name}
          {pipeline.is_default && (
            <Badge variant="secondary" className="ml-2">
              Default
            </Badge>
          )}
        </CardTitle>
        <Button size="sm" onClick={openAdd} disabled={isPending}>
          <Plus />
          Add stage
        </Button>
      </CardHeader>

      <CardContent>
        <ul className="divide-y rounded-md border">
          {stages.map((stage, index) => (
            <li
              key={stage.id}
              className={`flex items-center gap-3 p-3 ${
                stage.is_active ? "" : "bg-muted/40"
              }`}
            >
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: stage.color }}
                aria-hidden
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{stage.name}</span>
                  {stage.is_won && <Badge variant="secondary">Won</Badge>}
                  {stage.is_lost && <Badge variant="destructive">Lost</Badge>}
                  {!stage.is_active && <Badge variant="outline">Archived</Badge>}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isPending || index === 0}
                  onClick={() =>
                    run("Stage moved.", () =>
                      moveStage({ id: stage.id, direction: "up" }),
                    )
                  }
                  aria-label={`Move ${stage.name} up`}
                >
                  <ChevronUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isPending || index === stages.length - 1}
                  onClick={() =>
                    run("Stage moved.", () =>
                      moveStage({ id: stage.id, direction: "down" }),
                    )
                  }
                  aria-label={`Move ${stage.name} down`}
                >
                  <ChevronDown />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => openEdit(stage)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    run(stage.is_active ? "Stage archived." : "Stage restored.", () =>
                      updateStage({
                        id: stage.id,
                        name: stage.name,
                        color: stage.color,
                        outcome: outcomeOf(stage),
                        isActive: !stage.is_active,
                      }),
                    )
                  }
                >
                  {stage.is_active ? "Archive" : "Restore"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>

      <Dialog
        open={adding || editing !== null}
        onOpenChange={(next) => {
          if (!next) {
            setAdding(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit stage" : "Add a stage"}</DialogTitle>
            <DialogDescription>
              Stages are data, so this takes effect immediately with no deploy.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="stageName">Name</FieldLabel>
              <Input
                id="stageName"
                value={name}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="stageColor">Colour</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id="stageColor"
                  type="color"
                  className="h-9 w-16 p-1"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                />
                <span className="font-mono text-sm text-muted-foreground">{color}</span>
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="stageOutcome">Outcome</FieldLabel>
              <Select
                value={outcome}
                onValueChange={(value) => setOutcome(value as typeof outcome)}
              >
                <SelectTrigger id="stageOutcome">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">In progress</SelectItem>
                  <SelectItem value="won">Closes as won</SelectItem>
                  <SelectItem value="lost">Closes as lost</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                A deal dragged into a won or lost stage is closed automatically.
              </FieldDescription>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAdding(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={isPending || name.trim().length === 0}
              onClick={() =>
                editing
                  ? run("Stage updated.", () =>
                      updateStage({
                        id: editing.id,
                        name,
                        color,
                        outcome,
                        isActive: editing.is_active,
                      }),
                    )
                  : run("Stage added.", () =>
                      createStage({ pipelineId: pipeline.id, name, color, outcome }),
                    )
              }
            >
              {isPending && <Loader2 className="animate-spin" />}
              {editing ? "Save changes" : "Add stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

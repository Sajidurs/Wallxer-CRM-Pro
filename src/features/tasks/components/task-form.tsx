"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { createTask, updateTask } from "../actions";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  taskSchema,
  type TaskInput,
  type TaskValues,
} from "../schema";
import { TaskLinksField } from "./task-links-field";

const NONE = "__none__";

interface Option {
  id: string;
  name: string;
}

interface TaskFormProps {
  taskId?: string;
  defaults: TaskInput;
  projects: Option[];
  contacts: Option[];
  assignees: Option[];
  /** Reassignment is manager work; a member editing their own task keeps it. */
  canReassign: boolean;
}

export function TaskForm({
  taskId,
  defaults,
  projects,
  contacts,
  assignees,
  canReassign,
}: TaskFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TaskInput, unknown, TaskValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: defaults,
  });

  async function onSubmit(values: TaskValues) {
    setFormError(null);

    const result = taskId
      ? await updateTask({ id: taskId, values })
      : await createTask(values);

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [name, messages] of Object.entries(result.fieldErrors)) {
          if (messages?.[0]) {
            setError(name as keyof TaskInput, { message: messages[0] });
          }
        }
      }
      setFormError(result.error);
      return;
    }

    toast.success(taskId ? "Task updated." : "Task created.");
    router.replace(`/tasks/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>The work</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input id="title" autoFocus aria-invalid={!!errors.title} {...register("title")} />
              <FieldError errors={[errors.title]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Textarea id="description" rows={5} {...register("description")} />
            </Field>

            <TaskLinksField control={control} register={register} />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Where it belongs</CardTitle>
          <CardDescription>
            Linking a task to a project puts it on that project&apos;s Tasks tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="projectId"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="projectId">Project</FieldLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                    >
                      <SelectTrigger id="projectId">
                        <SelectValue placeholder="No project" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No project</SelectItem>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="contactId"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="contactId">Contact</FieldLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                    >
                      <SelectTrigger id="contactId">
                        <SelectValue placeholder="No contact" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No contact</SelectItem>
                        {contacts.map((contact) => (
                          <SelectItem key={contact.id} value={contact.id}>
                            {contact.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="assigneeId"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="assigneeId">Assignee</FieldLabel>
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                      disabled={!canReassign}
                    >
                      <SelectTrigger id="assigneeId">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {assignees.map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {person.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!canReassign && (
                      <FieldDescription>
                        Only a manager can reassign a task.
                      </FieldDescription>
                    )}
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="priority">Priority</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_PRIORITIES.map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {TASK_PRIORITY_LABELS[priority]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timing</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-3">
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="status">Status</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {TASK_STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />

              <Field data-invalid={!!errors.startAt}>
                <FieldLabel htmlFor="startAt">Starts</FieldLabel>
                <Input id="startAt" type="datetime-local" {...register("startAt")} />
                <FieldError errors={[errors.startAt]} />
              </Field>

              <Field data-invalid={!!errors.dueAt}>
                <FieldLabel htmlFor="dueAt">Due</FieldLabel>
                <Input
                  id="dueAt"
                  type="datetime-local"
                  aria-invalid={!!errors.dueAt}
                  {...register("dueAt")}
                />
                <FieldError errors={[errors.dueAt]} />
              </Field>
            </div>

            <Field data-invalid={!!errors.estimatedMinutes}>
              <FieldLabel htmlFor="estimatedMinutes">Estimate, in minutes</FieldLabel>
              <Input
                id="estimatedMinutes"
                type="number"
                min={1}
                className="sm:w-48"
                aria-invalid={!!errors.estimatedMinutes}
                {...register("estimatedMinutes")}
              />
              <FieldError errors={[errors.estimatedMinutes]} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          {isSubmitting ? "Saving" : taskId ? "Save changes" : "Create task"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

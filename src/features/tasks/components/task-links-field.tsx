"use client";

import { Link2, Plus, Trash2 } from "lucide-react";
import {
  Controller,
  useFieldArray,
  type Control,
  type UseFormRegister,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LINK_KINDS,
  LINK_KIND_LABELS,
} from "@/features/shared/resource-links/schema";

import type { TaskInput } from "../schema";

interface TaskLinksFieldProps {
  control: Control<TaskInput>;
  register: UseFormRegister<TaskInput>;
}

/**
 * The repeatable links section from SYSTEM_DESIGN 8.5: name, URL, and kind,
 * with an "add another" control and no fixed limit beyond a sanity cap.
 *
 * `kind: 'video'` is what carries the recorded walkthrough the design calls
 * for, and `document` the named document links. Backed by `resource_links`, so
 * the same rows would render on a project or a contact unchanged.
 */
export function TaskLinksField({ control, register }: TaskLinksFieldProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "links" });

  return (
    <Field>
      <FieldLabel htmlFor="task-links">Links</FieldLabel>
      <FieldDescription>
        A recorded walkthrough, a spec, a design file. Anything the person doing
        this task needs to open.
      </FieldDescription>

      <div className="space-y-3" id="task-links">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid gap-2 rounded-md border p-3 sm:grid-cols-[10rem_1fr_1fr_auto]"
          >
            <Controller
              control={control}
              name={`links.${index}.kind` as const}
              render={({ field: kindField }) => (
                <Select value={kindField.value} onValueChange={kindField.onChange}>
                  <SelectTrigger aria-label={`Link ${index + 1} kind`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LINK_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {LINK_KIND_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />

            <Input
              placeholder="Name"
              aria-label={`Link ${index + 1} name`}
              {...register(`links.${index}.name` as const)}
            />
            <Input
              placeholder="https://"
              aria-label={`Link ${index + 1} URL`}
              {...register(`links.${index}.url` as const)}
            />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(index)}
              aria-label={`Remove link ${index + 1}`}
            >
              <Trash2 />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ kind: "reference", name: "", url: "" })}
        >
          {fields.length === 0 ? <Link2 /> : <Plus />}
          {fields.length === 0 ? "Add a link" : "Add another"}
        </Button>
      </div>
    </Field>
  );
}

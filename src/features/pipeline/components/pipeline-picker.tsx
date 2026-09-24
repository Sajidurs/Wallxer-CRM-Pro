"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { Pipeline } from "../queries";

interface PipelinePickerProps {
  pipelines: Pipeline[];
  activeId: string;
}

/** Which pipeline is on screen lives in the URL, so a board is linkable. */
export function PipelinePicker({ pipelines, activeId }: PipelinePickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Select
        value={activeId}
        disabled={isPending}
        onValueChange={(value) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("pipelineId", value);
          startTransition(() => router.replace(`${pathname}?${params.toString()}`));
        }}
      >
        <SelectTrigger className="w-56" aria-label="Choose a pipeline">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {pipelines.map((pipeline) => (
            <SelectItem key={pipeline.id} value={pipeline.id}>
              {pipeline.name}
              {pipeline.is_default ? " · default" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

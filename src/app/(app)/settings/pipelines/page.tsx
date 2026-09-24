import { Info } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StageManager } from "@/features/pipeline/components/stage-manager";
import { listPipelines, listStages } from "@/features/pipeline/queries";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Pipelines" };

export default async function PipelinesSettingsPage() {
  await requireRole("admin");

  const pipelines = await listPipelines();

  // Archived stages included: hiding them would leave no way to restore one.
  const stagesByPipeline = await Promise.all(
    pipelines.map(async (pipeline) => ({
      pipeline,
      stages: await listStages(pipeline.id, true),
    })),
  );

  return (
    <>
      <PageHeader
        title="Pipelines"
        description="Stages are data, not code. Rename, reorder, add, and archive them here — no deploy needed."
      />

      <Alert>
        <Info />
        <AlertDescription>
          A stage marked won or lost closes any deal dragged into it, and stamps
          the closing date. A stage holding deals cannot be archived until they
          are moved.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        {stagesByPipeline.map(({ pipeline, stages }) => (
          <StageManager key={pipeline.id} pipeline={pipeline} stages={stages} />
        ))}
      </div>
    </>
  );
}

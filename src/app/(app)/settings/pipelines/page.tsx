import type { Metadata } from "next";

import { ComingSoon } from "@/components/common/coming-soon";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Pipelines" };

export default async function Page() {
  await requireRole("admin");

  return (
    <ComingSoon
      title="Pipelines"
      description="Pipelines and their stages, editable without a deploy."
      phase={5}
    />
  );
}

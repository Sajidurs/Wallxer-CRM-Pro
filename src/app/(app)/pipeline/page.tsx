import type { Metadata } from "next";

import { ComingSoon } from "@/components/common/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Pipeline" };

export default async function Page() {
  await requireUser();

  return (
    <ComingSoon
      title="Pipeline"
      description="Deals on a drag-and-drop board, with stages you control."
      phase={5}
    />
  );
}

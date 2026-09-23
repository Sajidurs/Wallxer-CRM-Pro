import type { Metadata } from "next";

import { ComingSoon } from "@/components/common/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Tasks" };

export default async function Page() {
  await requireUser();

  return (
    <ComingSoon
      title="Tasks"
      description="Team task management across list, board, and calendar views."
      phase={4}
    />
  );
}

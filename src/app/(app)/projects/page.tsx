import type { Metadata } from "next";

import { ComingSoon } from "@/components/common/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Projects" };

export default async function Page() {
  await requireUser();

  return (
    <ComingSoon
      title="Projects"
      description="Client work, with websites, encrypted credentials, and files."
      phase={3}
    />
  );
}

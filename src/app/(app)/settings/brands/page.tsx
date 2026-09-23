import type { Metadata } from "next";

import { ComingSoon } from "@/components/common/coming-soon";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Brands" };

export default async function Page() {
  await requireRole("admin");

  return (
    <ComingSoon
      title="Brands"
      description="The brands records are tagged with."
      phase={1}
    />
  );
}

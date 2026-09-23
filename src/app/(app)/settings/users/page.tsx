import type { Metadata } from "next";

import { ComingSoon } from "@/components/common/coming-soon";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Users" };

export default async function Page() {
  await requireRole("admin");

  return (
    <ComingSoon
      title="Users"
      description="Invite teammates, assign roles, and suspend accounts."
      phase={1}
    />
  );
}

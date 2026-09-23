import type { Metadata } from "next";

import { ComingSoon } from "@/components/common/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Contacts" };

export default async function Page() {
  await requireUser();

  return (
    <ComingSoon
      title="Contacts"
      description="People and companies, with search, filters, and full history."
      phase={2}
    />
  );
}

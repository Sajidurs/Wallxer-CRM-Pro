import { Construction } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/layout/page-header";

interface ComingSoonProps {
  title: string;
  description: string;
  phase: number;
}

/**
 * Placeholder for a route the sidebar links to but the phase has not built yet.
 * A stub that explains itself beats a 404 that looks like a bug.
 */
export function ComingSoon({ title, description, phase }: ComingSoonProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={Construction}
        title={`Arrives in Phase ${phase}`}
        description="See the build order in SYSTEM_DESIGN.md section 9. Each phase ends with working, deployed software."
      />
    </>
  );
}

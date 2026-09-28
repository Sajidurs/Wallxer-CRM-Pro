import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { listIssuerOptions } from "@/features/brands/queries";
import { listContactOptions } from "@/features/contacts/queries";
import { RenewalForm } from "@/features/renewals/components/renewal-form";
import { getRenewal } from "@/features/renewals/queries";
import type {
  RenewalCategory,
  RenewalCycle,
  RenewalStatus,
} from "@/features/renewals/schema";
import { listProjectOptions } from "@/features/projects/queries";
import { requireUser } from "@/lib/auth";
import { minorToInput, type Currency } from "@/lib/money";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Edit renewal" };

export default async function EditRenewalPage(
  props: PageProps<"/renewals/[id]/edit">,
) {
  const actor = await requireUser();
  if (!can(actor, "update", "project")) redirect("/renewals");

  const { id } = await props.params;
  const renewal = await getRenewal(id);
  if (!renewal) notFound();

  const [clients, projects, companies] = await Promise.all([
    listContactOptions(),
    listProjectOptions(),
    listIssuerOptions(),
  ]);

  return (
    <>
      <PageHeader title={`Edit ${renewal.name}`} />

      <Card className="max-w-4xl">
        <CardContent>
          <RenewalForm
            clients={clients}
            projects={projects}
            companies={companies}
            renewalId={renewal.id}
            defaultValues={{
              name: renewal.name,
              category: renewal.category as RenewalCategory,
              vendor: renewal.vendor,
              contactId: renewal.contact_id,
              projectId: renewal.project_id,
              brandId: renewal.brand_id,
              status: renewal.status as RenewalStatus,
              cycle: renewal.cycle as RenewalCycle,
              startedOn: renewal.started_on,
              nextRenewalOn: renewal.next_renewal_on,
              lastRenewedOn: renewal.last_renewed_on,
              currency: renewal.currency as Currency,
              price:
                renewal.price_minor === null ? "" : minorToInput(Number(renewal.price_minor)),
              cost:
                renewal.cost_minor === null ? "" : minorToInput(Number(renewal.cost_minor)),
              autoRenew: renewal.auto_renew,
              reminderDays: String(renewal.reminder_days),
              loginUrl: renewal.login_url,
              notes: renewal.notes,
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}

import { format, formatDistanceToNow } from "date-fns";
import { Building2, CalendarDays, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listBrandOptions } from "@/features/brands/queries";
import { getContact } from "@/features/contacts/queries";
import { displayName } from "@/features/contacts/schema";
import { DealActions } from "@/features/pipeline/components/deal-actions";
import {
  dealHistory,
  getDeal,
  getWorkspaceSettings,
  listAllStages,
} from "@/features/pipeline/queries";
import {
  DEAL_STATUS_LABELS,
  formatAmount,
  showValues,
  type DealStatus,
} from "@/features/pipeline/schema";
import { listAssignableUsers } from "@/features/users/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export async function generateMetadata(
  props: PageProps<"/pipeline/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const deal = await getDeal(id);
  return { title: deal ? deal.title : "Deal" };
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  open: "default",
  won: "secondary",
  lost: "destructive",
};

export default async function DealDetailPage(props: PageProps<"/pipeline/[id]">) {
  const actor = await requireUser();
  const { id } = await props.params;

  const deal = await getDeal(id);
  if (!deal) notFound();

  const [stages, history, owners, brands, contact, settings] = await Promise.all([
    listAllStages(),
    dealHistory(deal.id),
    listAssignableUsers(),
    listBrandOptions(),
    deal.contact_id ? getContact(deal.contact_id) : Promise.resolve(null),
    getWorkspaceSettings(),
  ]);

  const stageById = new Map(stages.map((s) => [s.id, s]));
  const ownerById = new Map(owners.map((o) => [o.id, o.name]));

  const stage = stageById.get(deal.stage_id);
  const brand = brands.find((b) => b.id === deal.brand_id);
  const values = showValues(settings);

  return (
    <>
      <PageHeader
        title={deal.title}
        description={`Created ${formatDistanceToNow(new Date(deal.created_at))} ago`}
        actions={
          <DealActions
            dealId={deal.id}
            title={deal.title}
            canEdit={can(actor, "update", "deal")}
            canDelete={can(actor, "delete", "deal")}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[deal.status] ?? "default"}>
          {DEAL_STATUS_LABELS[deal.status as DealStatus] ?? deal.status}
        </Badge>
        {stage && (
          <Badge variant="outline" className="gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: stage.color }}
              aria-hidden
            />
            {stage.name}
          </Badge>
        )}
        {brand && <Badge variant="outline">{brand.name}</Badge>}
        {values && deal.amount !== null && (
          <Badge variant="secondary">
            {formatAmount(deal.amount, deal.currency)}
          </Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              {deal.description ? (
                <p className="whitespace-pre-wrap text-sm">{deal.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No description.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                How it progressed ({history.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Written by a trigger on every stage change, so this is what
                  actually happened rather than what anyone remembered to log. */}
              <ol className="space-y-3">
                {history.map((entry) => {
                  const from = entry.from_stage_id
                    ? stageById.get(entry.from_stage_id)
                    : null;
                  const to = stageById.get(entry.to_stage_id);

                  return (
                    <li key={entry.id} className="flex items-start gap-3 text-sm">
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: to?.color ?? "#64748b" }}
                        aria-hidden
                      />
                      <div>
                        <div>
                          {from ? (
                            <>
                              {from.name} <span className="text-muted-foreground">→</span>{" "}
                              {to?.name ?? "a stage"}
                            </>
                          ) : (
                            <>Entered the pipeline at {to?.name ?? "a stage"}</>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {entry.changed_by
                            ? `${ownerById.get(entry.changed_by) ?? "Someone"} · `
                            : ""}
                          {format(new Date(entry.changed_at), "d MMM yyyy, HH:mm")}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Contact</div>
                {contact ? (
                  <Link href={`/contacts/${contact.id}`} className="hover:underline">
                    {displayName(contact)}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Not linked</span>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2">
              <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Owner</div>
                {deal.owner_id
                  ? (ownerById.get(deal.owner_id) ?? "Someone")
                  : <span className="text-muted-foreground">Unassigned</span>}
              </div>
            </div>

            <div className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Expected close</div>
                {deal.expected_close_date ? (
                  format(new Date(deal.expected_close_date), "d MMM yyyy")
                ) : (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </div>
            </div>

            {deal.closed_at && (
              <div className="border-t pt-3 text-xs text-muted-foreground">
                Closed {formatDistanceToNow(new Date(deal.closed_at))} ago
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

import { format, formatDistanceToNow, isPast } from "date-fns";
import { Building2, CalendarDays, Pencil, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listBrandOptions } from "@/features/brands/queries";
import { getContact } from "@/features/contacts/queries";
import { displayName } from "@/features/contacts/schema";
import { CredentialsPanel } from "@/features/credentials/components/credentials-panel";
import {
  lastRevealsByCredential,
  listProjectCredentials,
} from "@/features/credentials/queries";
import { WebsitesPanel } from "@/features/projects/components/websites-panel";
import { getProject, listProjectWebsites } from "@/features/projects/queries";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/features/projects/schema";
import { AttachmentsPanel } from "@/features/shared/attachments/components/attachments-panel";
import { listAttachments } from "@/features/shared/attachments/queries";
import { listAssignableUsers } from "@/features/users/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export async function generateMetadata(
  props: PageProps<"/projects/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const project = await getProject(id);
  return { title: project ? project.name : "Project" };
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  planning: "outline",
  active: "default",
  on_hold: "secondary",
  completed: "secondary",
  cancelled: "outline",
};

export default async function ProjectDetailPage(
  props: PageProps<"/projects/[id]">,
) {
  const actor = await requireUser();
  const { id } = await props.params;

  const project = await getProject(id);
  if (!project) notFound();

  const [websites, credentials, brands, owners, client, attachments] =
    await Promise.all([
      listProjectWebsites(project.id),
      listProjectCredentials(project.id),
      listBrandOptions(),
      listAssignableUsers(),
      project.contact_id ? getContact(project.contact_id) : Promise.resolve(null),
      listAttachments("project", project.id),
    ]);

  const reveals = await lastRevealsByCredential(credentials.map((c) => c.id));
  const ownerById = new Map(owners.map((o) => [o.id, o.name]));

  // Resolved to names here, in the server component, so the client component
  // never receives a user list it does not need.
  const lastReveals = Object.fromEntries(
    [...reveals.entries()].map(([credentialId, access]) => [
      credentialId,
      {
        userName: ownerById.get(access.user_id) ?? "someone",
        at: access.created_at,
      },
    ]),
  );

  const brand = brands.find((b) => b.id === project.brand_id);
  const owner = project.owner_id ? ownerById.get(project.owner_id) : null;
  const overdue =
    project.due_date &&
    isPast(new Date(project.due_date)) &&
    (project.status === "active" || project.status === "planning");

  return (
    <>
      <PageHeader
        title={project.name}
        description={
          project.code
            ? `${project.code} · created ${formatDistanceToNow(new Date(project.created_at))} ago`
            : `Created ${formatDistanceToNow(new Date(project.created_at))} ago`
        }
        actions={
          can(actor, "update", "project") && (
            <Button asChild variant="outline">
              <Link href={`/projects/${project.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[project.status] ?? "outline"}>
          {PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? project.status}
        </Badge>
        {brand && (
          <Badge variant="outline" className="gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: brand.color }}
              aria-hidden
            />
            {brand.name}
          </Badge>
        )}
        {overdue && <Badge variant="destructive">Overdue</Badge>}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="websites">Websites ({websites.length})</TabsTrigger>
          <TabsTrigger value="credentials">
            Credentials ({credentials.length})
          </TabsTrigger>
          <TabsTrigger value="files">Files ({attachments.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                {project.description ? (
                  <p className="whitespace-pre-wrap text-sm">{project.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No description yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Client</div>
                    {client ? (
                      <Link
                        href={`/contacts/${client.id}`}
                        className="hover:underline"
                      >
                        {displayName(client)}
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
                    {owner ?? <span className="text-muted-foreground">Unassigned</span>}
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Dates</div>
                    {project.start_date || project.due_date ? (
                      <span className={overdue ? "text-destructive" : undefined}>
                        {project.start_date
                          ? format(new Date(project.start_date), "d MMM yyyy")
                          : "—"}
                        {" → "}
                        {project.due_date
                          ? format(new Date(project.due_date), "d MMM yyyy")
                          : "—"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not scheduled</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="websites" className="mt-4">
          <WebsitesPanel
            projectId={project.id}
            websites={websites}
            canEdit={can(actor, "update", "project")}
          />
        </TabsContent>

        <TabsContent value="credentials" className="mt-4">
          <CredentialsPanel
            projectId={project.id}
            credentials={credentials}
            lastReveals={lastReveals}
            canCreate={can(actor, "create", "credential")}
            canEdit={can(actor, "update", "credential")}
            canDelete={can(actor, "delete", "credential")}
          />
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <AttachmentsPanel
            entityType="project"
            entityId={project.id}
            attachments={attachments}
            uploaderNames={Object.fromEntries(ownerById)}
            currentUserId={actor.id}
            canManage={can(actor, "update", "project")}
          />
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <EmptyState
            title="Tasks arrive in Phase 4"
            description="Work items for this project will appear here once the tasks module exists."
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

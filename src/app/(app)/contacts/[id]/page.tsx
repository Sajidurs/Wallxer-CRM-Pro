import { formatDistanceToNow } from "date-fns";
import {
  Building2,
  FolderKanban,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  User,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listBrandOptions } from "@/features/brands/queries";
import {
  getContact,
  getContactChildren,
} from "@/features/contacts/queries";
import {
  STATUS_LABELS,
  TYPE_LABELS,
  displayName,
} from "@/features/contacts/schema";
import { listProjectsForContact } from "@/features/projects/queries";
import { PROJECT_STATUS_LABELS } from "@/features/projects/schema";
import { AttachmentsPanel } from "@/features/shared/attachments/components/attachments-panel";
import { listAttachments } from "@/features/shared/attachments/queries";
import { EntityTaskList } from "@/features/tasks/components/entity-task-list";
import { listTasksFor } from "@/features/tasks/queries";
import { listAssignableUsers } from "@/features/users/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export async function generateMetadata(
  props: PageProps<"/contacts/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const contact = await getContact(id);
  return { title: contact ? displayName(contact) : "Contact" };
}

/** Tabs that exist in the design but whose modules have not been built. */
const PENDING_TABS = [
  { value: "deals", label: "Deals", phase: 5 },
  { value: "activity", label: "Activity", phase: 7 },
];

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Mail;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="break-words text-sm">{children}</div>
      </div>
    </div>
  );
}

export default async function ContactDetailPage(
  props: PageProps<"/contacts/[id]">,
) {
  const actor = await requireUser();
  const { id } = await props.params;

  const [contact, brands, owners, projects, attachments] = await Promise.all([
    getContact(id),
    listBrandOptions(),
    listAssignableUsers(),
    listProjectsForContact(id),
    listAttachments("contact", id),
  ]);

  const tasks = await listTasksFor("contact_id", id);

  if (!contact) notFound();

  const children =
    contact.type === "company" ? await getContactChildren(contact.id) : [];

  const parent = contact.parent_contact_id
    ? await getContact(contact.parent_contact_id)
    : null;

  const brand = brands.find((b) => b.id === contact.brand_id);
  const owner = owners.find((o) => o.id === contact.owner_id);
  const address = (contact.address ?? {}) as Record<string, string | null>;
  const addressLine = [
    address.street,
    address.city,
    address.state,
    address.postal,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");

  const name = displayName(contact);
  const Icon = contact.type === "company" ? Building2 : User;

  return (
    <>
      <PageHeader
        title={name}
        description={`${TYPE_LABELS[contact.type]} · added ${formatDistanceToNow(
          new Date(contact.created_at),
        )} ago`}
        actions={
          can(actor, "update", "contact") && (
            <Button asChild variant="outline">
              <Link href={`/contacts/${contact.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          {STATUS_LABELS[contact.status as keyof typeof STATUS_LABELS] ??
            contact.status}
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
        {contact.tags.map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="projects">Projects ({projects.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="files">Files ({attachments.length})</TabsTrigger>
          <TabsContent value="tasks" className="mt-4">
          <EntityTaskList
            tasks={tasks}
            people={Object.fromEntries(owners.map((o) => [o.id, o.name]))}
            newTaskHref={`/tasks/new?contactId=${contact.id}`}
            emptyDescription="Work items for this contact, whether or not they belong to a project."
          />
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <AttachmentsPanel
            entityType="contact"
            entityId={contact.id}
            attachments={attachments}
            uploaderNames={Object.fromEntries(owners.map((o) => [o.id, o.name]))}
            currentUserId={actor.id}
            canManage={can(actor, "update", "contact")}
          />
        </TabsContent>

        {PENDING_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {contact.email && (
                    <DetailRow icon={Mail} label="Email">
                      <a href={`mailto:${contact.email}`} className="hover:underline">
                        {contact.email}
                      </a>
                    </DetailRow>
                  )}
                  {contact.phone && (
                    <DetailRow icon={Phone} label="Phone">
                      <a href={`tel:${contact.phone}`} className="hover:underline">
                        {contact.phone}
                      </a>
                    </DetailRow>
                  )}
                  {contact.whatsapp && (
                    <DetailRow icon={MessageCircle} label="WhatsApp">
                      {contact.whatsapp}
                    </DetailRow>
                  )}
                  {contact.website && (
                    <DetailRow icon={Globe} label="Website">
                      <a
                        href={
                          contact.website.startsWith("http")
                            ? contact.website
                            : `https://${contact.website}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {contact.website}
                      </a>
                    </DetailRow>
                  )}
                  {addressLine && (
                    <DetailRow icon={MapPin} label="Address">
                      {addressLine}
                    </DetailRow>
                  )}
                  {parent && (
                    <DetailRow icon={Building2} label="Works at">
                      <Link
                        href={`/contacts/${parent.id}`}
                        className="hover:underline"
                      >
                        {displayName(parent)}
                      </Link>
                    </DetailRow>
                  )}
                </div>

                {!contact.email &&
                  !contact.phone &&
                  !contact.whatsapp &&
                  !contact.website &&
                  !addressLine && (
                    <p className="text-sm text-muted-foreground">
                      No contact details recorded yet.
                    </p>
                  )}

                {contact.notes && (
                  <>
                    <Separator />
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">Notes</div>
                      <p className="whitespace-pre-wrap text-sm">{contact.notes}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Ownership</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Owner</div>
                    {owner?.name ?? (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Source</div>
                    {contact.source ?? (
                      <span className="text-muted-foreground">Not recorded</span>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Last updated</div>
                    {formatDistanceToNow(new Date(contact.updated_at))} ago
                  </div>
                </CardContent>
              </Card>

              {contact.type === "company" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      People ({children.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {children.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nobody is linked to this company yet. Set &ldquo;Works
                        at&rdquo; on a person to link them.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {children.map((person) => (
                          <li key={person.id}>
                            <Link
                              href={`/contacts/${person.id}`}
                              className="text-sm hover:underline"
                            >
                              {displayName(person)}
                            </Link>
                            {person.job_title && (
                              <div className="text-xs text-muted-foreground">
                                {person.job_title}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="projects" className="mt-4">
          {projects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects for this client yet"
              description="A project holds the websites, credentials, and files for one piece of work."
              action={
                can(actor, "create", "project") && (
                  <Button asChild>
                    <Link href={`/projects/new?contactId=${contact.id}`}>
                      <Plus />
                      New project
                    </Link>
                  </Button>
                )
              }
            />
          ) : (
            <div className="space-y-3">
              {can(actor, "create", "project") && (
                <div className="flex justify-end">
                  <Button asChild size="sm">
                    <Link href={`/projects/new?contactId=${contact.id}`}>
                      <Plus />
                      New project
                    </Link>
                  </Button>
                </div>
              )}
              <ul className="divide-y rounded-lg border">
                {projects.map((project) => (
                  <li key={project.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium hover:underline"
                      >
                        {project.name}
                      </Link>
                      {project.code && (
                        <div className="font-mono text-xs text-muted-foreground">
                          {project.code}
                        </div>
                      )}
                    </div>
                    <Badge variant="outline">
                      {PROJECT_STATUS_LABELS[
                        project.status as keyof typeof PROJECT_STATUS_LABELS
                      ] ?? project.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>

        {PENDING_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-4">
            <EmptyState
              icon={Icon}
              title={`${tab.label} arrive in Phase ${tab.phase}`}
              description={`Once that module exists, everything linked to ${name} shows here automatically.`}
            />
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

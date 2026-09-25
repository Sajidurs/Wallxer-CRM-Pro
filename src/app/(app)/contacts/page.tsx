import { Plus, Upload, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listBrandOptions } from "@/features/brands/queries";
import { ContactFilters } from "@/features/contacts/components/contact-filters";
import { ContactsTable } from "@/features/contacts/components/contacts-table";
import { listContacts, listUsedTags } from "@/features/contacts/queries";
import { contactFiltersSchema } from "@/features/contacts/schema";
import { listAssignableUsers } from "@/features/users/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage(props: PageProps<"/contacts">) {
  const actor = await requireUser();
  const searchParams = await props.searchParams;

  // Unparseable query strings fall back to defaults rather than erroring: a
  // hand-edited URL should not produce a crash page.
  const parsed = contactFiltersSchema.safeParse(searchParams);
  const filters = parsed.success
    ? parsed.data
    : contactFiltersSchema.parse({});

  const [result, brands, owners, tags] = await Promise.all([
    listContacts(filters),
    listBrandOptions(),
    listAssignableUsers(),
    listUsedTags(),
  ]);

  const hasFilters = Boolean(
    filters.q ||
      filters.type ||
      filters.status ||
      filters.brandId ||
      filters.ownerId ||
      filters.tag,
  );

  const canCreate = can(actor, "create", "contact");

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Every person and company across all brands."
        actions={
          canCreate && (
            <>
              <Button asChild variant="outline">
                <Link href="/contacts/import">
                  <Upload />
                  Import
                </Link>
              </Button>
              <Button asChild>
                <Link href="/contacts/new">
                  <Plus />
                  New contact
                </Link>
              </Button>
            </>
          )
        }
      />

      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <ContactFilters brands={brands} owners={owners} tags={tags} />
      </Suspense>

      {result.contacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title={hasFilters ? "No contacts match those filters" : "No contacts yet"}
          description={
            hasFilters
              ? "Try clearing a filter, or searching for something less specific."
              : "Add the people and companies you work with. Deals, projects, and tasks all hang off them."
          }
          action={
            !hasFilters &&
            canCreate && (
              <Button asChild>
                <Link href="/contacts/new">
                  <Plus />
                  New contact
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          <ContactsTable
            contacts={result.contacts}
            brands={brands}
            owners={owners}
            canEdit={can(actor, "update", "contact")}
            canDelete={can(actor, "delete", "contact")}
          />
          <Suspense fallback={null}>
            <Pagination
              page={result.page}
              pageCount={result.pageCount}
              total={result.total}
              label="contacts"
            />
          </Suspense>
        </div>
      )}
    </>
  );
}

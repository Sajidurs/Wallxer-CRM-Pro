import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { listBrandOptions } from "@/features/brands/queries";
import { ContactForm } from "@/features/contacts/components/contact-form";
import { getContact, listCompanyOptions } from "@/features/contacts/queries";
import { displayName } from "@/features/contacts/schema";
import { listAssignableUsers } from "@/features/users/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Edit contact" };

export default async function EditContactPage(
  props: PageProps<"/contacts/[id]/edit">,
) {
  const actor = await requireUser();
  const { id } = await props.params;

  if (!can(actor, "update", "contact")) {
    redirect(`/contacts/${id}`);
  }

  const [contact, brands, owners, companies] = await Promise.all([
    getContact(id),
    listBrandOptions(),
    listAssignableUsers(),
    listCompanyOptions(),
  ]);

  if (!contact) notFound();

  const address = (contact.address ?? {}) as Record<string, string | null>;

  return (
    <>
      <PageHeader
        title={`Edit ${displayName(contact)}`}
        description="Changes are visible to the whole team immediately."
      />

      <div className="max-w-3xl">
        <ContactForm
          contactId={contact.id}
          brands={brands}
          owners={owners}
          // A contact cannot be its own parent, so keep it out of the picker.
          companies={companies.filter((company) => company.id !== contact.id)}
          defaults={{
            type: contact.type,
            firstName: contact.first_name ?? "",
            lastName: contact.last_name ?? "",
            companyName: contact.company_name ?? "",
            jobTitle: contact.job_title ?? "",
            email: contact.email ?? "",
            phone: contact.phone ?? "",
            whatsapp: contact.whatsapp ?? "",
            website: contact.website ?? "",
            status: contact.status as "lead" | "active" | "inactive" | "archived",
            source: contact.source ?? "",
            notes: contact.notes ?? "",
            tags: contact.tags ?? [],
            brandId: contact.brand_id,
            ownerId: contact.owner_id,
            parentContactId: contact.parent_contact_id,
            address: {
              street: address.street ?? "",
              city: address.city ?? "",
              state: address.state ?? "",
              country: address.country ?? "",
              postal: address.postal ?? "",
            },
          }}
        />
      </div>
    </>
  );
}

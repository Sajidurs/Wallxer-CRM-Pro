import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { listBrandOptions } from "@/features/brands/queries";
import { ContactForm } from "@/features/contacts/components/contact-form";
import { listCompanyOptions } from "@/features/contacts/queries";
import { listAssignableUsers } from "@/features/users/queries";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "New contact" };

export default async function NewContactPage() {
  const actor = await requireUser();

  if (!can(actor, "create", "contact")) {
    redirect("/contacts");
  }

  const [brands, owners, companies] = await Promise.all([
    listBrandOptions(),
    listAssignableUsers(),
    listCompanyOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="New contact"
        description="A person or a company. You can change which later."
      />

      <div className="max-w-3xl">
        <ContactForm
          brands={brands}
          owners={owners}
          companies={companies}
          defaults={{
            type: "person",
            firstName: "",
            lastName: "",
            companyName: "",
            jobTitle: "",
            email: "",
            phone: "",
            whatsapp: "",
            website: "",
            status: "lead",
            source: "",
            notes: "",
            tags: [],
            brandId: null,
            // Whoever adds a contact usually owns it. Changeable in the form.
            ownerId: actor.id,
            parentContactId: null,
            address: {
              street: "",
              city: "",
              state: "",
              country: "",
              postal: "",
            },
          }}
        />
      </div>
    </>
  );
}

import { Building2, User } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BrandOption } from "@/features/brands/queries";
import type { UserOption } from "@/features/users/queries";

import type { ContactListItem } from "../queries";
import { STATUS_LABELS, displayName } from "../schema";
import { ContactRowActions } from "./contact-row-actions";

interface ContactsTableProps {
  contacts: ContactListItem[];
  brands: BrandOption[];
  owners: UserOption[];
  canEdit: boolean;
  canDelete: boolean;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  lead: "default",
  active: "secondary",
  inactive: "outline",
  archived: "outline",
};

export function ContactsTable({
  contacts,
  brands,
  owners,
  canEdit,
  canDelete,
}: ContactsTableProps) {
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const ownerById = new Map(owners.map((o) => [o.id, o]));

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="hidden md:table-cell">Contact</TableHead>
            <TableHead className="hidden lg:table-cell">Brand</TableHead>
            <TableHead className="hidden lg:table-cell">Owner</TableHead>
            <TableHead className="hidden sm:table-cell">Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((contact) => {
            const name = displayName(contact);
            const brand = contact.brand_id ? brandById.get(contact.brand_id) : null;
            const owner = contact.owner_id ? ownerById.get(contact.owner_id) : null;
            const Icon = contact.type === "company" ? Building2 : User;

            return (
              <TableRow key={contact.id}>
                <TableCell>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Icon className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/contacts/${contact.id}`}
                        className="font-medium hover:underline"
                      >
                        {name}
                      </Link>
                      {contact.job_title && (
                        <div className="truncate text-xs text-muted-foreground">
                          {contact.job_title}
                        </div>
                      )}
                      {contact.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {contact.tags.slice(0, 3).map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="px-1.5 py-0 text-[10px]"
                            >
                              {tag}
                            </Badge>
                          ))}
                          {contact.tags.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{contact.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>

                <TableCell className="hidden md:table-cell">
                  <div className="space-y-0.5 text-sm">
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="block truncate hover:underline"
                      >
                        {contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="block truncate text-muted-foreground hover:underline"
                      >
                        {contact.phone}
                      </a>
                    )}
                    {!contact.email && !contact.phone && (
                      <span className="text-muted-foreground">&mdash;</span>
                    )}
                  </div>
                </TableCell>

                <TableCell className="hidden lg:table-cell">
                  {brand ? (
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: brand.color }}
                        aria-hidden
                      />
                      {brand.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </TableCell>

                <TableCell className="hidden text-sm lg:table-cell">
                  {owner?.name ?? (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>

                <TableCell className="hidden sm:table-cell">
                  <Badge variant={STATUS_VARIANT[contact.status] ?? "outline"}>
                    {STATUS_LABELS[contact.status as keyof typeof STATUS_LABELS] ??
                      contact.status}
                  </Badge>
                </TableCell>

                <TableCell>
                  <ContactRowActions
                    contactId={contact.id}
                    name={name}
                    canEdit={canEdit}
                    canDelete={canDelete}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

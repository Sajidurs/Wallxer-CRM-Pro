import {
  AtSign,
  Building2,
  CalendarDays,
  Hash,
  Link2,
  Tag,
  Type,
  User,
  UserCircle,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Pill, type PillTone } from "@/components/common/pill";
import type { BrandOption } from "@/features/brands/queries";
import type { UserOption } from "@/features/users/queries";

import type { ContactListItem } from "../queries";
import { STATUS_LABELS, TYPE_LABELS, displayName } from "../schema";
import { ContactRowActions } from "./contact-row-actions";

interface ContactsTableProps {
  contacts: ContactListItem[];
  brands: BrandOption[];
  owners: UserOption[];
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * A Notion database table, rather than a card with a table inside it.
 *
 * The grid is the design: hairlines in both directions, headings that recede
 * behind a small property-type icon, and the first column carrying the link.
 * Values describing a state become soft pills; everything else stays plain
 * text, because a table where every cell is decorated is a table nobody can
 * scan.
 */

const STATUS_TONE: Record<string, PillTone> = {
  lead: "blue",
  active: "green",
  inactive: "grey",
  archived: "grey",
};

const TYPE_TONE: Record<string, PillTone> = {
  person: "purple",
  company: "amber",
};

/** A muted label behind a small property-type icon, as Notion heads a column. */
function Th({
  icon: Icon,
  children,
  className = "",
}: {
  icon: typeof Type;
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={
        "border-b border-r border-border px-3 py-2 text-left align-middle font-normal last:border-r-0 " +
        className
      }
    >
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0 opacity-70" />
        {children}
      </span>
    </th>
  );
}

const CELL =
  "border-b border-r border-border px-3 py-2 align-middle last:border-r-0";

const EMPTY = <span className="text-muted-foreground/50">&mdash;</span>;

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
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <Th icon={Type} className="min-w-[200px]">
              Name
            </Th>
            <Th icon={Hash} className="hidden sm:table-cell">
              Type
            </Th>
            <Th icon={AtSign} className="hidden md:table-cell">
              Email
            </Th>
            <Th icon={Link2} className="hidden lg:table-cell">
              Phone
            </Th>
            <Th icon={Building2} className="hidden lg:table-cell">
              Brand
            </Th>
            <Th icon={UserCircle} className="hidden xl:table-cell">
              Owner
            </Th>
            <Th icon={CalendarDays}>Status</Th>
            <Th icon={Tag} className="hidden xl:table-cell">
              Tags
            </Th>
            <th className="w-10 border-b border-border" />
          </tr>
        </thead>

        <tbody>
          {contacts.map((contact) => {
            const name = displayName(contact);
            const brand = contact.brand_id
              ? brandById.get(contact.brand_id)
              : null;
            const owner = contact.owner_id
              ? ownerById.get(contact.owner_id)
              : null;
            const Icon = contact.type === "company" ? Building2 : User;

            return (
              <tr
                key={contact.id}
                className="group transition-colors hover:bg-accent/40"
              >
                {/* The title property: the only bold cell, and the only link. */}
                <td className={CELL}>
                  <div className="flex items-center gap-2">
                    <Icon className="size-3.5 shrink-0 text-muted-foreground/70" />
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="truncate font-medium decoration-muted-foreground/40 underline-offset-[3px] group-hover:underline"
                    >
                      {name}
                    </Link>
                  </div>
                  {contact.job_title && (
                    <span className="mt-0.5 block truncate pl-[22px] text-xs text-muted-foreground">
                      {contact.job_title}
                    </span>
                  )}
                </td>

                <td className={CELL + " hidden sm:table-cell"}>
                  <Pill tone={TYPE_TONE[contact.type] ?? "grey"}>
                    {TYPE_LABELS[contact.type]}
                  </Pill>
                </td>

                <td className={CELL + " hidden md:table-cell"}>
                  {contact.email ? (
                    <a
                      href={`mailto:${contact.email}`}
                      className="truncate underline decoration-border underline-offset-[3px] hover:decoration-foreground"
                    >
                      {contact.email}
                    </a>
                  ) : (
                    EMPTY
                  )}
                </td>

                <td className={CELL + " hidden lg:table-cell"}>
                  {contact.phone ? (
                    <a
                      href={`tel:${contact.phone}`}
                      className="whitespace-nowrap underline decoration-border underline-offset-[3px] hover:decoration-foreground"
                    >
                      {contact.phone}
                    </a>
                  ) : (
                    EMPTY
                  )}
                </td>

                <td className={CELL + " hidden lg:table-cell"}>
                  {brand ? (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: brand.color }}
                        aria-hidden
                      />
                      {brand.name}
                    </span>
                  ) : (
                    EMPTY
                  )}
                </td>

                <td className={CELL + " hidden xl:table-cell"}>
                  {owner ? (
                    <span className="whitespace-nowrap">{owner.name}</span>
                  ) : (
                    EMPTY
                  )}
                </td>

                <td className={CELL}>
                  <Pill tone={STATUS_TONE[contact.status] ?? "grey"} dot>
                    {STATUS_LABELS[
                      contact.status as keyof typeof STATUS_LABELS
                    ] ?? contact.status}
                  </Pill>
                </td>

                <td className={CELL + " hidden xl:table-cell"}>
                  {contact.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {contact.tags.slice(0, 2).map((tag) => (
                        <Pill key={tag} tone="pink">
                          {tag}
                        </Pill>
                      ))}
                      {contact.tags.length > 2 && (
                        <span className="text-xs text-muted-foreground">
                          +{contact.tags.length - 2}
                        </span>
                      )}
                    </div>
                  ) : (
                    EMPTY
                  )}
                </td>

                {/* Row actions stay invisible until the row is touched, so the
                    grid reads as data rather than as a column of buttons. */}
                <td className="border-b border-border px-1 py-2 align-middle">
                  <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <ContactRowActions
                      contactId={contact.id}
                      name={name}
                      canEdit={canEdit}
                      canDelete={canDelete}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

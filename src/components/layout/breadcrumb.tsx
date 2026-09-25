"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

/**
 * The quiet path line at the top of the reference, above the page title.
 *
 * Derived from the URL rather than passed down, so a new route gets a
 * breadcrumb for free and no page has to remember to supply one. Ids are
 * dropped: "/contacts/9f3e…/edit" reads as Contacts › Edit, because a uuid is
 * not something anyone wants to see in a breadcrumb.
 */
const LABELS: Record<string, string> = {
  dashboard: "Home",
  contacts: "Contacts",
  projects: "Projects",
  tasks: "Tasks",
  pipeline: "Pipeline",
  settings: "Settings",
  users: "Users",
  brands: "Brands",
  pipelines: "Pipelines",
  profile: "Profile",
  new: "New",
  edit: "Edit",
  import: "Import",
};

const IS_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

export function Breadcrumb() {
  const pathname = usePathname();

  const segments = pathname
    .split("/")
    .filter(Boolean)
    .filter((segment) => !IS_ID.test(segment));

  if (segments.length === 0) return null;

  const crumbs = segments.map((segment, index) => ({
    label: LABELS[segment] ?? segment.replace(/-/g, " "),
    href: "/" + segments.slice(0, index + 1).join("/"),
    last: index === segments.length - 1,
  }));

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
      {crumbs.map((crumb) => (
        <Fragment key={crumb.href}>
          {crumb.last ? (
            <span className="font-medium capitalize text-foreground">
              {crumb.label}
            </span>
          ) : (
            <>
              <Link
                href={crumb.href}
                className="capitalize text-muted-foreground transition-colors hover:text-foreground"
              >
                {crumb.label}
              </Link>
              <ChevronRight className="size-3.5 text-muted-foreground/50" />
            </>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

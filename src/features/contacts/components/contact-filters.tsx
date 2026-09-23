"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  CONTACT_STATUSES,
  CONTACT_TYPES,
  STATUS_LABELS,
  TYPE_LABELS,
} from "../schema";

const ALL = "__all__";

interface Option {
  id: string;
  name: string;
}

interface ContactFiltersProps {
  brands: Option[];
  owners: Option[];
  tags: string[];
}

/**
 * Filter state lives in the URL, not in component state.
 *
 * That makes a filtered list linkable and survivable across a refresh, and it
 * is what lets the server component do the filtering — the alternative is
 * shipping every contact to the browser to filter it there.
 */
export function ContactFilters({ brands, owners, tags }: ContactFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // The search box is uncontrolled between submissions so typing does not hit
  // the server on every keystroke, but it must still follow the URL when that
  // changes from elsewhere — Clear, the back button, a pasted link.
  //
  // Adjusted during render rather than in an effect. An effect would render the
  // stale value once and then immediately render again, and React explicitly
  // documents this pattern for the case.
  const urlQuery = searchParams.get("q") ?? "";
  const [search, setSearch] = useState(urlQuery);
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);

  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setSearch(urlQuery);
  }

  function apply(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "" || value === ALL) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    // Any filter change invalidates the page number: page 7 of a narrower
    // result set is usually empty, which reads as "no contacts".
    params.delete("page");

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  const activeCount = ["q", "type", "status", "brandId", "ownerId", "tag"].filter(
    (key) => searchParams.get(key),
  ).length;

  return (
    <div className="space-y-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply({ q: search });
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, company, email, phone"
            className="pl-8"
            aria-label="Search contacts"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={isPending}>
          Search
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Select
          value={searchParams.get("type") ?? ALL}
          onValueChange={(value) => apply({ type: value })}
        >
          <SelectTrigger className="w-36" aria-label="Filter by type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {CONTACT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("status") ?? ALL}
          onValueChange={(value) => apply({ status: value })}
        >
          <SelectTrigger className="w-36" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {CONTACT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("brandId") ?? ALL}
          onValueChange={(value) => apply({ brandId: value })}
        >
          <SelectTrigger className="w-40" aria-label="Filter by brand">
            <SelectValue placeholder="Brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All brands</SelectItem>
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("ownerId") ?? ALL}
          onValueChange={(value) => apply({ ownerId: value })}
        >
          <SelectTrigger className="w-40" aria-label="Filter by owner">
            <SelectValue placeholder="Owner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All owners</SelectItem>
            {owners.map((owner) => (
              <SelectItem key={owner.id} value={owner.id}>
                {owner.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {tags.length > 0 && (
          <Select
            value={searchParams.get("tag") ?? ALL}
            onValueChange={(value) => apply({ tag: value })}
          >
            <SelectTrigger className="w-36" aria-label="Filter by tag">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All tags</SelectItem>
              {tags.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={searchParams.get("sort") ?? "recent"}
          onValueChange={(value) => apply({ sort: value })}
        >
          <SelectTrigger className="w-40" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Newest first</SelectItem>
            <SelectItem value="updated">Recently updated</SelectItem>
            <SelectItem value="name">Name, A to Z</SelectItem>
          </SelectContent>
        </Select>

        {activeCount > 0 && (
          <Button
            variant="ghost"
            onClick={() => startTransition(() => router.replace(pathname))}
          >
            <X />
            Clear {activeCount}
          </Button>
        )}
      </div>
    </div>
  );
}

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface PersonInfo {
  name: string;
  /** A signed URL, or null when there is no photo. */
  avatarUrl: string | null;
}

/** Two letters, for when there is no photo — or before one loads. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SIZES = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
} as const;

/**
 * A face on its own, for places where space only allows one — a stack of
 * assignees on a board card, say. The name still reaches assistive technology
 * and a hover, so the photo is never the only way to know who this is.
 */
export function PersonAvatar({
  person,
  size = "sm",
  className,
}: {
  person: PersonInfo;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <Avatar className={cn(SIZES[size], className)} title={person.name}>
      {person.avatarUrl && <AvatarImage src={person.avatarUrl} alt="" />}
      <AvatarFallback className="bg-sidebar font-semibold text-muted-foreground">
        {initials(person.name)}
      </AvatarFallback>
    </Avatar>
  );
}

/** A face with the name beside it, for lists and detail pages. */
export function Person({
  person,
  size = "sm",
  className,
}: {
  person: PersonInfo;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <PersonAvatar person={person} size={size} />
      <span className="truncate">{person.name}</span>
    </span>
  );
}

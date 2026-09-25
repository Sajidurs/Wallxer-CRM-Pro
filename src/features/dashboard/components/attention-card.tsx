import { Star } from "lucide-react";
import Link from "next/link";

interface AttentionCardProps {
  label: string;
  title: string;
  meta: string[];
  href: string;
}

/**
 * The single most pressing thing, in the soft amber callout from the reference.
 *
 * Deliberately one item. A list of five priorities is not a priority list, and
 * the whole point of this block is that it answers "what now" without reading.
 */
export function AttentionCard({ label, title, meta, href }: AttentionCardProps) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-xl border border-highlight-border bg-highlight p-4 transition-colors hover:brightness-[0.99]"
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background/70 shadow-xs">
        <Star className="size-4 text-highlight-foreground" />
      </div>

      <div className="min-w-0 space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-highlight-foreground">
          {label}
        </p>
        <p className="truncate font-semibold">{title}</p>
        {meta.length > 0 && (
          <p className="truncate text-xs text-muted-foreground">
            {meta.join(" · ")}
          </p>
        )}
      </div>
    </Link>
  );
}

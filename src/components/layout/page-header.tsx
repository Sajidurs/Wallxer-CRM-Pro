import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Primary actions for the page, rendered right-aligned. */
  actions?: ReactNode;
}

/**
 * Title and one line of context, as in the reference: a large, tight heading
 * with a muted sentence under it, and no rule beneath. The separation comes
 * from space, not from a border.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em]">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2 sm:pt-1">{actions}</div>
      )}
    </div>
  );
}

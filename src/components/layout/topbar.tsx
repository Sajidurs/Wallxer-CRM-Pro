import { Breadcrumb } from "@/components/layout/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserMenu } from "@/components/layout/user-menu";

interface TopbarProps {
  fullName: string;
  email: string;
  role: string;
  avatarUrl: string | null;
}

/**
 * A thin, quiet bar: the path on the left, the account on the right, nothing
 * competing with the page title below it. No border and no background — in the
 * reference the header is simply the top of the page, and a rule across it
 * would cut the content area in half for no reason.
 */
export function Topbar({ fullName, email, role, avatarUrl }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 bg-background/80 px-4 backdrop-blur-sm">
      <SidebarTrigger className="-ml-1 size-7 text-muted-foreground" />
      <Breadcrumb />

      <div className="flex-1" />

      <UserMenu
        fullName={fullName}
        email={email}
        role={role}
        avatarUrl={avatarUrl}
      />
    </header>
  );
}

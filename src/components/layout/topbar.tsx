import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserMenu } from "@/components/layout/user-menu";

interface TopbarProps {
  fullName: string;
  email: string;
  role: string;
  avatarUrl: string | null;
}

/**
 * Sticky top bar. Global search lands here in Phase 7; the space between the
 * trigger and the user menu is deliberately left open for it.
 */
export function Topbar({ fullName, email, role, avatarUrl }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />

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

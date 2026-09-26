"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_SECTIONS } from "@/components/layout/nav-config";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { can, canAccessFinance, type Role, type UserStatus } from "@/lib/permissions";

export interface NavCounts {
  contacts?: number;
  projects?: number;
  tasks?: number;
  deals?: number;
}

interface AppSidebarProps {
  workspaceName: string;
  user: { role: Role; status: UserStatus; finance_access: boolean };
  counts: NavCounts;
}

/**
 * The shell's navigation, styled after Notion: a warm off-white panel beside a
 * white page, quiet rows, and counts sitting on the right rather than in
 * badges. The active row is the only white surface in here, which is what makes
 * it read as selected without needing a colour.
 */
export function AppSidebar({ workspaceName, user, counts }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="gap-3 px-3 pt-3">
        <div className="flex items-center gap-2 px-1">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground text-[11px] font-semibold text-background">
            {workspaceName.charAt(0).toUpperCase()}
          </div>
          <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
            {workspaceName}
          </span>
        </div>

        <div className="group-data-[collapsible=icon]:hidden">
          <Button
            asChild
            variant="outline"
            className="h-9 w-full justify-start gap-2 bg-background text-sm font-medium shadow-xs"
          >
            <Link href="/contacts/new">
              <Plus className="size-4" />
              New contact
            </Link>
          </Button>
        </div>

        {/* Not wired to anything yet — global search is still Phase 7. It is
            here because the row is part of the layout's rhythm, and disabled
            is more honest than a box that swallows what you type. */}
        <button
          type="button"
          disabled
          className="flex h-8 w-full cursor-not-allowed items-center gap-2 rounded-md px-2 text-sm text-muted-foreground/70 group-data-[collapsible=icon]:hidden"
        >
          <Search className="size-4" />
          <span>Search</span>
          <kbd className="ml-auto rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Soon
          </kbd>
        </button>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {NAV_SECTIONS.map((section) => {
          const visible = section.items.filter(
            (item) =>
              can(user, "view", item.resource) &&
              (item.grant !== "finance" || canAccessFinance(user)),
          );
          if (visible.length === 0) return null;

          return (
            <SidebarGroup key={section.label} className="py-1">
              <SidebarGroupLabel className="px-2 text-[11px] font-medium text-muted-foreground/80">
                {section.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visible.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                    const count = item.countKey ? counts[item.countKey] : undefined;

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.title}
                          className="h-8 gap-2 rounded-md px-2 text-sm font-normal data-[active=true]:bg-background data-[active=true]:font-medium data-[active=true]:shadow-xs data-[active=true]:ring-1 data-[active=true]:ring-border"
                        >
                          <Link href={item.href}>
                            <item.icon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">{item.title}</span>
                            {count !== undefined && count > 0 && (
                              <span className="ml-auto text-xs tabular-nums text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
                                {count}
                              </span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="px-4 pb-3 group-data-[collapsible=icon]:hidden">
        <p className="text-[11px] text-muted-foreground/70">
          {workspaceName} CRM
        </p>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Every authenticated page renders inside this. `requireUser` runs on each
 * request, so a session that is revoked or suspended mid-visit is caught on the
 * next navigation rather than lingering until the cookie expires.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await requireUser();

  const supabase = await createClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", profile.workspace_id)
    .maybeSingle();

  return (
    <SidebarProvider>
      <AppSidebar
        workspaceName={workspace?.name ?? "Workspace"}
        user={{ role: profile.role, status: profile.status }}
      />
      <SidebarInset>
        <Topbar
          fullName={profile.full_name}
          email={profile.email}
          role={profile.role}
          avatarUrl={profile.avatar_url}
        />
        <main className="flex-1 space-y-6 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageTransition } from "@/components/layout/page-transition";
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

  // Counts for the sidebar. Head-only requests, so the database returns a
  // number and no rows, and all four go at once.
  const [workspace, contacts, projects, tasks, deals] = await Promise.all([
    supabase
      .from("workspaces")
      .select("name")
      .eq("id", profile.workspace_id)
      .maybeSingle(),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .neq("status", "done"),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "open"),
  ]);

  return (
    <SidebarProvider>
      <AppSidebar
        workspaceName={workspace.data?.name ?? "Workspace"}
        user={{ role: profile.role, status: profile.status }}
        counts={{
          contacts: contacts.count ?? 0,
          projects: projects.count ?? 0,
          tasks: tasks.count ?? 0,
          deals: deals.count ?? 0,
        }}
      />
      <SidebarInset>
        <Topbar
          fullName={profile.full_name}
          email={profile.email}
          role={profile.role}
          avatarUrl={profile.avatar_url}
        />
        {/* A single readable column rather than full width. Notion's content
            area is generous but bounded; text running the width of a 27in
            monitor is not calm, it is just wide. */}
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-6 py-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Every read here goes through a view, never a table.
 *
 * Section 8.1: the dashboard must not be able to disagree with the modules.
 * A count written by hand here would drift the first time a module changed its
 * filters — the views apply exactly the same `deleted_at is null` and status
 * conditions the lists do, in one place.
 *
 * The views are `security_invoker`, so RLS still applies to every one of these.
 */

export interface DashboardCounts {
  active_projects: number;
  open_deals: number;
  contacts: number;
  tasks_due_today: number;
  tasks_overdue: number;
}

const EMPTY_COUNTS: DashboardCounts = {
  active_projects: 0,
  open_deals: 0,
  contacts: 0,
  tasks_due_today: 0,
  tasks_overdue: 0,
};

export async function getCounts(): Promise<DashboardCounts> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_dashboard_counts")
    .select("*")
    .maybeSingle();

  // A dashboard that throws is worse than one showing zeros: the counters are
  // a summary, not the reason the page exists.
  if (error || !data) return EMPTY_COUNTS;

  return {
    active_projects: Number(data.active_projects ?? 0),
    open_deals: Number(data.open_deals ?? 0),
    contacts: Number(data.contacts ?? 0),
    tasks_due_today: Number(data.tasks_due_today ?? 0),
    tasks_overdue: Number(data.tasks_overdue ?? 0),
  };
}

export interface StageSummary {
  stage_id: string;
  pipeline_id: string;
  stage_name: string;
  color: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  deal_count: number;
}

export async function getDealsByStage(): Promise<StageSummary[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("v_deals_by_stage")
    .select("*")
    .order("position", { ascending: true });

  return (data ?? []).map((row) => ({
    stage_id: row.stage_id as string,
    pipeline_id: row.pipeline_id as string,
    stage_name: row.stage_name as string,
    color: row.color as string,
    position: Number(row.position ?? 0),
    is_won: Boolean(row.is_won),
    is_lost: Boolean(row.is_lost),
    deal_count: Number(row.deal_count ?? 0),
  }));
}

export interface AtRiskProject {
  id: string;
  name: string;
  code: string | null;
  due_date: string;
  owner_id: string | null;
  days_overdue: number;
}

export async function getProjectsAtRisk(): Promise<AtRiskProject[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("v_projects_at_risk")
    .select("*")
    .order("days_overdue", { ascending: false })
    .limit(10);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    code: (row.code as string | null) ?? null,
    due_date: row.due_date as string,
    owner_id: (row.owner_id as string | null) ?? null,
    days_overdue: Number(row.days_overdue ?? 0),
  }));
}

export interface ActivityEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  changes: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
}

export async function getRecentActivity(limit = 20): Promise<ActivityEntry[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("v_recent_activity")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    entity_type: row.entity_type as string,
    entity_id: row.entity_id as string,
    action: row.action as string,
    changes: (row.changes ?? {}) as Record<string, unknown>,
    created_at: row.created_at as string,
    actor_name: (row.actor_name as string | null) ?? null,
  }));
}

export interface MyTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  project_id: string | null;
}

export async function getMyTasks(userId: string, limit = 8): Promise<MyTask[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("v_my_tasks")
    .select("*")
    .eq("user_id", userId)
    // Tasks with no due date sink below the ones that have one.
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    status: row.status as string,
    priority: row.priority as string,
    due_at: (row.due_at as string | null) ?? null,
    project_id: (row.project_id as string | null) ?? null,
  }));
}

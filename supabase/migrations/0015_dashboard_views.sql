-- 0015_dashboard_views.sql
-- Phase 6. The dashboard reads the same tables the modules do, through views,
-- so its numbers can never drift from what each list shows. Section 8.1.
--
-- EVERY VIEW HERE IS `security_invoker = on`. This is the whole security story
-- of this migration: a Postgres view runs as its *owner* by default, which
-- means it bypasses the RLS of whoever queries it. A dashboard built on owner
-- views would happily show one workspace's counts to another's users, and
-- would look completely correct while doing it. With security_invoker the
-- caller's policies apply, so a suspended user — whose auth_workspace_id() is
-- null — counts nothing at all.
--
-- Forward only. Never edit once applied.

-- ---------------------------------------------------------------------------
-- Counters
-- ---------------------------------------------------------------------------
-- One row. Each count is a scalar subquery over the same table the module
-- lists from, with the same `deleted_at is null` filter, so the number on the
-- dashboard and the number of rows in the list are the same question.

create view public.v_dashboard_counts
with (security_invoker = on)
as
select
  (select count(*) from public.projects
     where deleted_at is null and status = 'active')                  as active_projects,
  (select count(*) from public.deals
     where deleted_at is null and status = 'open')                    as open_deals,
  (select count(*) from public.contacts
     where deleted_at is null)                                        as contacts,
  (select count(*) from public.tasks
     where deleted_at is null
       and status <> 'done'
       and due_at >= now()
       and due_at < (now() + interval '1 day'))                       as tasks_due_today,
  (select count(*) from public.tasks
     where deleted_at is null
       and status <> 'done'
       and due_at < now())                                            as tasks_overdue;

-- ---------------------------------------------------------------------------
-- Pipeline summary
-- ---------------------------------------------------------------------------
-- Every active stage, including the empty ones: a stage with no deals is a
-- fact about the pipeline, not a row to omit.

create view public.v_deals_by_stage
with (security_invoker = on)
as
select
  s.id           as stage_id,
  s.pipeline_id,
  s.name         as stage_name,
  s.color,
  s.position,
  s.is_won,
  s.is_lost,
  count(d.id)    as deal_count
from public.pipeline_stages s
left join public.deals d
  on d.stage_id = s.id and d.deleted_at is null
where s.is_active
group by s.id, s.pipeline_id, s.name, s.color, s.position, s.is_won, s.is_lost;

-- ---------------------------------------------------------------------------
-- Projects at risk
-- ---------------------------------------------------------------------------
-- Section 8.1: status `active` with a due date in the past.

create view public.v_projects_at_risk
with (security_invoker = on)
as
select
  p.id,
  p.name,
  p.code,
  p.due_date,
  p.owner_id,
  p.contact_id,
  (current_date - p.due_date) as days_overdue
from public.projects p
where p.deleted_at is null
  and p.status = 'active'
  and p.due_date is not null
  and p.due_date < current_date;

-- ---------------------------------------------------------------------------
-- Recent activity
-- ---------------------------------------------------------------------------
-- Joined to the actor's name here rather than in the app, so the feed is one
-- query instead of one per row.

create view public.v_recent_activity
with (security_invoker = on)
as
select
  a.id,
  a.entity_type,
  a.entity_id,
  a.action,
  a.changes,
  a.created_at,
  a.actor_id,
  p.full_name as actor_name
from public.activity_log a
left join public.profiles p on p.id = a.actor_id;

-- ---------------------------------------------------------------------------
-- My tasks
-- ---------------------------------------------------------------------------
-- The assignee join lives here so the dashboard and the tasks module cannot
-- disagree about what "mine" means.

create view public.v_my_tasks
with (security_invoker = on)
as
select
  t.id,
  t.title,
  t.status,
  t.priority,
  t.due_at,
  t.project_id,
  ta.user_id
from public.tasks t
join public.task_assignees ta on ta.task_id = t.id
where t.deleted_at is null
  and t.status <> 'done';

grant select on public.v_dashboard_counts to authenticated;
grant select on public.v_deals_by_stage   to authenticated;
grant select on public.v_projects_at_risk to authenticated;
grant select on public.v_recent_activity  to authenticated;
grant select on public.v_my_tasks         to authenticated;

revoke all on public.v_dashboard_counts from anon;
revoke all on public.v_deals_by_stage   from anon;
revoke all on public.v_projects_at_risk from anon;
revoke all on public.v_recent_activity  from anon;
revoke all on public.v_my_tasks         from anon;

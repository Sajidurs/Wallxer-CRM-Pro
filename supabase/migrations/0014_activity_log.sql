-- 0014_activity_log.sql
-- Phase 6. The last of the four shared subsystems from section 5.6.
--
-- Written by triggers, never by the app, so an action cannot happen without
-- being recorded — the same reasoning as deal_stage_history in 0013. It powers
-- the dashboard's activity feed today and whatever audit question gets asked
-- later, and like the stage history it cannot be backfilled.
--
-- Forward only. Never edit once applied.

create table public.activity_log (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  actor_id     uuid references public.profiles(id) on delete set null,

  entity_type  text not null,
  entity_id    uuid not null,
  action       text not null,   -- created, updated, deleted, restored, status_changed

  -- Carries a `label` so the feed can name the record without joining to four
  -- different tables, plus whatever changed. A denormalised label can go stale
  -- if the record is later renamed; for a feed of what happened at the time,
  -- that is arguably more truthful than showing today's name.
  changes      jsonb not null default '{}'::jsonb,

  created_at   timestamptz not null default now(),

  constraint activity_log_entity_type_known check (
    entity_type in ('contact', 'deal', 'project', 'task', 'credential')
  )
);

create index activity_log_workspace_idx on public.activity_log (workspace_id, created_at desc);
create index activity_log_entity_idx    on public.activity_log (entity_type, entity_id, created_at desc);
create index activity_log_actor_idx     on public.activity_log (actor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- One trigger function for every table
-- ---------------------------------------------------------------------------
-- Generic on purpose. Adding activity to a new module is a `create trigger`
-- line, not another function to keep in step with this one.

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity  text;
  v_action  text;
  v_label   text;
  v_changes jsonb := '{}'::jsonb;
  v_row     record;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;

  v_entity := case tg_table_name
    when 'contacts' then 'contact'
    when 'projects' then 'project'
    when 'tasks'    then 'task'
    when 'deals'    then 'deal'
    else tg_table_name
  end;

  -- Each table names its records differently, and the feed needs one string.
  v_label := case tg_table_name
    when 'contacts' then coalesce(
      nullif(trim(coalesce(v_row.first_name, '') || ' ' || coalesce(v_row.last_name, '')), ''),
      v_row.company_name,
      'a contact'
    )
    when 'projects' then v_row.name
    when 'tasks'    then v_row.title
    when 'deals'    then v_row.title
    else 'a record'
  end;

  if tg_op = 'INSERT' then
    v_action := 'created';
  elsif tg_op = 'UPDATE' then
    -- A soft delete is an update; calling it "updated" would bury the one
    -- event anyone actually looks for.
    if old.deleted_at is null and new.deleted_at is not null then
      v_action := 'deleted';
    elsif old.deleted_at is not null and new.deleted_at is null then
      v_action := 'restored';
    elsif to_jsonb(old) ->> 'status' is distinct from to_jsonb(new) ->> 'status' then
      v_action := 'status_changed';
      v_changes := jsonb_build_object(
        'from', to_jsonb(old) ->> 'status',
        'to',   to_jsonb(new) ->> 'status'
      );
    else
      v_action := 'updated';
    end if;
  else
    v_action := 'deleted';
  end if;

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, action, changes)
  values (
    v_row.workspace_id,
    auth.uid(),
    v_entity,
    v_row.id,
    v_action,
    v_changes || jsonb_build_object('label', v_label)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger contacts_log_activity
  after insert or update on public.contacts
  for each row execute function public.log_activity();

create trigger projects_log_activity
  after insert or update on public.projects
  for each row execute function public.log_activity();

create trigger tasks_log_activity
  after insert or update on public.tasks
  for each row execute function public.log_activity();

create trigger deals_log_activity
  after insert or update on public.deals
  for each row execute function public.log_activity();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Readable by the workspace, writable by nobody. An audit trail that can be
-- edited is not one.

alter table public.activity_log enable row level security;

create policy "activity_log_select" on public.activity_log
  for select to authenticated
  using (workspace_id = public.auth_workspace_id());

revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;

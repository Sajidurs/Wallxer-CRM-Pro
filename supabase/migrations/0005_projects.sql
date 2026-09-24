-- 0005_projects.sql
-- Phase 3, part one. Projects and their websites. See SYSTEM_DESIGN.md 5.4.
--
-- Forward only. Never edit once applied.

create type public.project_status as enum
  ('planning', 'active', 'on_hold', 'completed', 'cancelled');

create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id),
  brand_id      uuid references public.brands(id) on delete set null,
  contact_id    uuid references public.contacts(id) on delete set null,  -- the client
  -- Which deal became this project. Null until Phase 5 exists, and stays null
  -- for work that never went through the pipeline.
  deal_id       uuid,

  name          text not null,
  code          text,                                   -- short human reference, PRJ-0042
  description   text,
  status        public.project_status not null default 'planning',
  start_date    date,
  due_date      date,
  owner_id      uuid references public.profiles(id) on delete set null,
  custom_fields jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null,
  deleted_at    timestamptz,

  constraint projects_name_present check (length(trim(name)) > 0),
  -- A project that ends before it starts is a typo, not a plan.
  constraint projects_dates_ordered check (
    start_date is null or due_date is null or due_date >= start_date
  )
);

-- Codes are optional, but two projects must not share one.
create unique index projects_workspace_code_key
  on public.projects (workspace_id, upper(code))
  where code is not null and deleted_at is null;

create index projects_workspace_idx on public.projects (workspace_id) where deleted_at is null;
create index projects_contact_idx   on public.projects (contact_id);
create index projects_brand_idx     on public.projects (brand_id);
create index projects_owner_idx     on public.projects (owner_id);
create index projects_status_idx    on public.projects (workspace_id, status) where deleted_at is null;
create index projects_due_idx       on public.projects (due_date) where deleted_at is null;

create index projects_search_idx on public.projects using gin (
  to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(code, '') || ' ' || coalesce(description, ''))
);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- project_websites
-- ---------------------------------------------------------------------------
-- Live, staging, dev, admin panel. Real client work always needs more than one.

create table public.project_websites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  project_id   uuid not null references public.projects(id) on delete cascade,
  label        text not null,
  url          text not null,
  environment  text not null default 'live',    -- live, staging, dev
  notes        text,
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null,

  constraint project_websites_label_present check (length(trim(label)) > 0),
  constraint project_websites_url_present check (url ~* '^https?://')
);

create index project_websites_project_idx on public.project_websites (project_id);

create trigger project_websites_set_updated_at
  before update on public.project_websites
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Soft delete guard
-- ---------------------------------------------------------------------------
-- Same reasoning as contacts in 0004: deleting is an UPDATE setting deleted_at,
-- which the UPDATE policy cannot tell apart from an edit.

create or replace function public.guard_project_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (old.deleted_at is null) <> (new.deleted_at is null) then
    if not public.is_manager() then
      raise exception 'Only a manager or above can delete or restore a project';
    end if;
  end if;

  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'projects.workspace_id cannot be changed';
  end if;

  return new;
end;
$$;

create trigger projects_guard_soft_delete
  before update on public.projects
  for each row execute function public.guard_project_soft_delete();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.projects         enable row level security;
alter table public.project_websites enable row level security;

create policy "projects_select_own_workspace" on public.projects
  for select to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and (deleted_at is null or public.is_manager())
  );

create policy "projects_insert_own_workspace" on public.projects
  for insert to authenticated
  with check (workspace_id = public.auth_workspace_id());

create policy "projects_update_own_workspace" on public.projects
  for update to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

-- No DELETE policy. Invariant 6: nothing is hard deleted.

-- Websites belong to a project and inherit its visibility. They are edited far
-- more casually than the project itself, so any active member may manage them,
-- but only through a project they can already see.
create policy "project_websites_select" on public.project_websites
  for select to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.deleted_at is null
    )
  );

create policy "project_websites_insert" on public.project_websites
  for insert to authenticated
  with check (workspace_id = public.auth_workspace_id());

create policy "project_websites_update" on public.project_websites
  for update to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

-- A website row is a link, not history. Removing one is a real delete, and a
-- member mistyping a staging URL should be able to remove it.
create policy "project_websites_delete" on public.project_websites
  for delete to authenticated
  using (workspace_id = public.auth_workspace_id());

revoke all on public.projects         from anon;
revoke all on public.project_websites from anon;

grant select, insert, update on public.projects to authenticated;
grant select, insert, update, delete on public.project_websites to authenticated;

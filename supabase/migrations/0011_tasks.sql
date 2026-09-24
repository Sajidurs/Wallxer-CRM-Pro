-- 0011_tasks.sql
-- Phase 4. Tasks and their assignees. See SYSTEM_DESIGN.md 5.5 and 8.5.
--
-- Forward only. Never edit once applied.

create type public.task_status as enum ('todo', 'in_progress', 'review', 'blocked', 'done');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');

create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id),
  project_id        uuid references public.projects(id) on delete cascade,
  contact_id        uuid references public.contacts(id) on delete set null,
  -- Subtasks: the column exists so nesting is a UI change later, not a
  -- migration. Unused in v1.
  parent_task_id    uuid references public.tasks(id) on delete set null,

  title             text not null,
  description       text,
  status            public.task_status not null default 'todo',
  priority          public.task_priority not null default 'medium',

  start_at          timestamptz,
  due_at            timestamptz,
  estimated_minutes int,
  actual_minutes    int,                       -- time tracking hook, unused in v1
  completed_at      timestamptz,

  -- Fractional ordering: dragging a card between two others sets its position
  -- to the midpoint of its neighbours, so one row updates instead of
  -- renumbering the column.
  position          numeric not null default 1000,

  custom_fields     jsonb not null default '{}'::jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null,
  deleted_at        timestamptz,

  constraint tasks_title_present check (length(trim(title)) > 0),
  constraint tasks_dates_ordered check (
    start_at is null or due_at is null or due_at >= start_at
  ),
  constraint tasks_estimate_sane check (
    estimated_minutes is null or (estimated_minutes > 0 and estimated_minutes <= 100000)
  ),
  constraint tasks_not_own_parent check (parent_task_id is distinct from id)
);

create index tasks_workspace_status_idx on public.tasks (workspace_id, status) where deleted_at is null;
create index tasks_project_idx          on public.tasks (project_id) where deleted_at is null;
create index tasks_contact_idx          on public.tasks (contact_id);
create index tasks_due_idx              on public.tasks (due_at) where deleted_at is null;
create index tasks_parent_idx           on public.tasks (parent_task_id);
create index tasks_board_idx            on public.tasks (workspace_id, status, position) where deleted_at is null;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- task_assignees
-- ---------------------------------------------------------------------------
-- A junction table even though v1 assigns one person. Going from one to many is
-- then a UI change instead of a data migration. See the Decision Log, 2026-09-19.

create table public.task_assignees (
  task_id      uuid not null references public.tasks(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id),
  assigned_at  timestamptz not null default now(),
  assigned_by  uuid references public.profiles(id) on delete set null,
  primary key (task_id, user_id)
);

create index task_assignees_user_idx on public.task_assignees (user_id);

-- ---------------------------------------------------------------------------
-- completed_at
-- ---------------------------------------------------------------------------
-- Maintained by the database so it cannot drift from status. The dashboard's
-- "finished this week" in Phase 6 depends on it being true.

create or replace function public.sync_task_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_sync_completed_at
  before insert or update on public.tasks
  for each row execute function public.sync_task_completed_at();

-- ---------------------------------------------------------------------------
-- Who may edit a task
-- ---------------------------------------------------------------------------
-- Section 4: a member may edit only tasks assigned to them. `canEditTask` in
-- lib/permissions.ts says the same thing for the UI, but the UI is not the
-- boundary — until now nothing stopped a member PATCHing any task directly.
--
-- An UPDATE policy cannot express "assigned to me" cheaply alongside the
-- workspace rule without also blocking the manager case, and it cannot
-- distinguish a soft delete from an edit at all. A trigger does both.

create or replace function public.guard_task_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'tasks.workspace_id cannot be changed';
  end if;

  -- Deleting and restoring are manager work, as with contacts and projects.
  if (old.deleted_at is null) <> (new.deleted_at is null) then
    if not public.is_manager() then
      raise exception 'Only a manager or above can delete or restore a task';
    end if;
    return new;
  end if;

  if public.is_manager() then
    return new;
  end if;

  if not exists (
    select 1 from public.task_assignees
    where task_id = old.id and user_id = auth.uid()
  ) then
    raise exception 'You can only edit tasks assigned to you';
  end if;

  return new;
end;
$$;

create trigger tasks_guard_edit
  before update on public.tasks
  for each row execute function public.guard_task_edit();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.tasks          enable row level security;
alter table public.task_assignees enable row level security;

-- The rule learned from migration 0009: whoever may set deleted_at must still
-- satisfy the SELECT policy afterwards, or the soft delete is rejected for
-- rejecting its own result. Deletion here is manager-only, so `or is_manager()`
-- is exactly the escape needed.
create policy "tasks_select_own_workspace" on public.tasks
  for select to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and (deleted_at is null or public.is_manager())
  );

create policy "tasks_insert_own_workspace" on public.tasks
  for insert to authenticated
  with check (workspace_id = public.auth_workspace_id());

-- Deliberately permissive; `guard_task_edit` decides who may actually write.
-- Splitting the rule across a policy and a trigger would mean two places to
-- keep in step.
create policy "tasks_update_own_workspace" on public.tasks
  for update to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

-- No DELETE policy. Invariant 6: nothing is hard deleted.

create policy "task_assignees_select" on public.task_assignees
  for select to authenticated
  using (workspace_id = public.auth_workspace_id());

-- Assignment is the lever that grants edit rights, so it cannot be looser than
-- editing itself. A member who could assign any task to themselves would have
-- found a one-step route to editing everything.
--
-- Manager and above assign freely. Everyone else may only set the assignees of
-- a task they created, which is what lets a member raise a task and put their
-- own name on it.
create policy "task_assignees_insert" on public.task_assignees
  for insert to authenticated
  with check (
    workspace_id = public.auth_workspace_id()
    and (
      public.is_manager()
      or exists (
        select 1 from public.tasks t
        where t.id = task_id and t.created_by = auth.uid()
      )
    )
  );

create policy "task_assignees_delete" on public.task_assignees
  for delete to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and (
      public.is_manager()
      or exists (
        select 1 from public.tasks t
        where t.id = task_id and t.created_by = auth.uid()
      )
    )
  );

revoke all on public.tasks          from anon;
revoke all on public.task_assignees from anon;

grant select, insert, update on public.tasks to authenticated;
grant select, insert, delete on public.task_assignees to authenticated;

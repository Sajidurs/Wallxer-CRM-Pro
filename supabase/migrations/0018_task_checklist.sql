-- 0018_task_checklist.sql
-- Phase 7. Subtask checklists, and the real progress they compute.
--
-- The board's cards show a progress bar. Rather than storing a percentage
-- somebody has to remember to drag, progress is derived: ticked items over
-- total items. A number nobody maintains by hand cannot go stale.
--
-- Shaped like 0012 rather than 0011: a checklist item is a note, not history.
-- Removing one you mistyped should not leave a tombstone, and nothing is lost
-- that cannot be typed again. Invariant 6 guards the records the business is
-- made of — contacts, projects, tasks, deals — which is why `resource_links`
-- already sits outside it for the same reason.
--
-- Forward only. Never edit once applied.

create table public.task_checklist_items (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  task_id      uuid not null references public.tasks(id) on delete cascade,

  title        text not null,
  is_done      boolean not null default false,

  -- Fractional, like tasks.position, so reordering one item updates one row.
  position     numeric not null default 1000,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,

  constraint task_checklist_items_title_present check (length(trim(title)) > 0)
);

create index task_checklist_items_task_idx
  on public.task_checklist_items (task_id, position);

create trigger task_checklist_items_set_updated_at
  before update on public.task_checklist_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- completed_at / completed_by
-- ---------------------------------------------------------------------------
-- Maintained by the database so they cannot drift from is_done, exactly as
-- tasks.completed_at is in 0011.
--
-- The INSERT branch returns before any reference to OLD. Migration 0016 was
-- written because PL/pgSQL resolves every record field reference in an
-- expression regardless of which branch would run, so `tg_op = 'INSERT' or
-- old.is_done` is not safe here however it reads.

create or replace function public.sync_checklist_item_done()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_done then
      new.completed_at := now();
      new.completed_by := auth.uid();
    end if;
    return new;
  end if;

  if new.is_done and not old.is_done then
    new.completed_at := now();
    new.completed_by := auth.uid();
  elsif not new.is_done then
    new.completed_at := null;
    new.completed_by := null;
  end if;

  return new;
end;
$$;

create trigger task_checklist_items_sync_done
  before insert or update on public.task_checklist_items
  for each row execute function public.sync_checklist_item_done();

-- ---------------------------------------------------------------------------
-- Who may change a checklist
-- ---------------------------------------------------------------------------
-- A checklist is part of its task, so it inherits the task's edit rule from
-- section 4: managers and above edit anything, a member edits only what is
-- assigned to them. `guard_task_edit` in 0011 says the same thing for the task
-- row itself; this states it once, as a function, so the four policies below
-- cannot drift apart from each other.
--
-- security definer because a member cannot necessarily read every row of
-- task_assignees, and search_path is pinned — the lesson of 0007.

create or replace function public.can_edit_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_manager()
    or exists (
      select 1
      from public.task_assignees
      where task_id = p_task_id
        and user_id = auth.uid()
    );
$$;

revoke all on function public.can_edit_task(uuid) from public, anon;
grant execute on function public.can_edit_task(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- No soft delete, so none of the SELECT-policy trap from 0009.

alter table public.task_checklist_items enable row level security;

-- Reading is workspace-wide: you can already read the task, and a checklist
-- you cannot see would make the task's progress bar unexplainable.
create policy "task_checklist_items_select" on public.task_checklist_items
  for select to authenticated
  using (workspace_id = public.auth_workspace_id());

create policy "task_checklist_items_insert" on public.task_checklist_items
  for insert to authenticated
  with check (
    workspace_id = public.auth_workspace_id()
    and public.can_edit_task(task_id)
  );

create policy "task_checklist_items_update" on public.task_checklist_items
  for update to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and public.can_edit_task(task_id)
  )
  with check (
    workspace_id = public.auth_workspace_id()
    and public.can_edit_task(task_id)
  );

create policy "task_checklist_items_delete" on public.task_checklist_items
  for delete to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and public.can_edit_task(task_id)
  );

revoke all on public.task_checklist_items from anon;
grant select, insert, update, delete on public.task_checklist_items to authenticated;

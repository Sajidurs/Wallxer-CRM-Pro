-- 0013_pipeline.sql
-- Phase 5. Pipelines, stages, deals, and the stage history that powers
-- velocity and conversion reporting later. See SYSTEM_DESIGN.md 5.3 and 8.3.
--
-- Stages are data, not code: they can be renamed, reordered, added, and
-- archived without a deploy. That is the whole reason pipeline_stages is a
-- table rather than an enum.
--
-- Forward only. Never edit once applied.

create type public.deal_status as enum ('open', 'won', 'lost');

-- ---------------------------------------------------------------------------
-- pipelines
-- ---------------------------------------------------------------------------
-- Multiple from day one, because different brands sell differently. One is
-- marked default and is what a new deal lands in unless told otherwise.

create table public.pipelines (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  brand_id     uuid references public.brands(id) on delete set null,
  name         text not null,
  is_default   boolean not null default false,
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint pipelines_name_present check (length(trim(name)) > 0)
);

-- At most one default per workspace. A partial unique index says that far more
-- reliably than application code remembering to clear the old one.
create unique index pipelines_one_default_per_workspace
  on public.pipelines (workspace_id)
  where is_default;

create index pipelines_workspace_idx on public.pipelines (workspace_id);

create trigger pipelines_set_updated_at
  before update on public.pipelines
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- pipeline_stages
-- ---------------------------------------------------------------------------

create table public.pipeline_stages (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  pipeline_id  uuid not null references public.pipelines(id) on delete cascade,
  name         text not null,
  position     int not null default 0,
  color        text not null default '#64748b',
  is_won       boolean not null default false,
  is_lost      boolean not null default false,
  -- Archived rather than deleted, so historical deals keep pointing somewhere
  -- real. An archived stage stays on the deals already in it and disappears
  -- from the board.
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint pipeline_stages_name_present check (length(trim(name)) > 0),
  -- A stage cannot be both the win and the loss.
  constraint pipeline_stages_outcome_exclusive check (not (is_won and is_lost))
);

create index pipeline_stages_pipeline_idx
  on public.pipeline_stages (pipeline_id, position);

create trigger pipeline_stages_set_updated_at
  before update on public.pipeline_stages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- deals
-- ---------------------------------------------------------------------------

create table public.deals (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id),
  pipeline_id         uuid not null references public.pipelines(id),
  stage_id            uuid not null references public.pipeline_stages(id),
  contact_id          uuid references public.contacts(id) on delete set null,
  brand_id            uuid references public.brands(id) on delete set null,

  title               text not null,
  description         text,
  status              public.deal_status not null default 'open',
  owner_id            uuid references public.profiles(id) on delete set null,

  -- Fractional ordering for drag and drop, as on tasks.
  position            numeric not null default 1000,
  expected_close_date date,

  -- Hidden in the v1 UI behind settings.pipeline.show_values. Present so that
  -- turning money tracking on is a toggle, not a migration against a live table
  -- that already has data in it.
  amount              numeric(14, 2),
  currency            text not null default 'USD',

  custom_fields       jsonb not null default '{}'::jsonb,
  closed_at           timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.profiles(id) on delete set null,
  deleted_at          timestamptz,

  constraint deals_title_present check (length(trim(title)) > 0),
  constraint deals_amount_sane check (amount is null or amount >= 0)
);

create index deals_workspace_idx  on public.deals (workspace_id) where deleted_at is null;
create index deals_pipeline_idx   on public.deals (pipeline_id, stage_id, position) where deleted_at is null;
create index deals_contact_idx    on public.deals (contact_id);
create index deals_owner_idx      on public.deals (owner_id);
create index deals_status_idx     on public.deals (workspace_id, status) where deleted_at is null;

create trigger deals_set_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- deal_stage_history
-- ---------------------------------------------------------------------------
-- Written by a trigger, never by the app, so no code path can move a deal
-- without recording it. This table is the raw material for the velocity and
-- conversion reports in section 11; collecting it from the first day costs
-- nothing and cannot be backfilled later.

create table public.deal_stage_history (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id),
  deal_id       uuid not null references public.deals(id) on delete cascade,
  from_stage_id uuid references public.pipeline_stages(id) on delete set null,
  to_stage_id   uuid not null references public.pipeline_stages(id) on delete cascade,
  changed_by    uuid references public.profiles(id) on delete set null,
  changed_at    timestamptz not null default now()
);

create index deal_stage_history_deal_idx
  on public.deal_stage_history (deal_id, changed_at desc);

create or replace function public.record_deal_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The insert is a move too: a deal entering the pipeline at its first stage
  -- is the start of its history, and leaving it out would make every duration
  -- calculation begin from the wrong point.
  if tg_op = 'INSERT' then
    insert into public.deal_stage_history
      (workspace_id, deal_id, from_stage_id, to_stage_id, changed_by)
    values (new.workspace_id, new.id, null, new.stage_id, auth.uid());
    return new;
  end if;

  if new.stage_id is distinct from old.stage_id then
    insert into public.deal_stage_history
      (workspace_id, deal_id, from_stage_id, to_stage_id, changed_by)
    values (new.workspace_id, new.id, old.stage_id, new.stage_id, auth.uid());
  end if;

  return new;
end;
$$;

create trigger deals_record_stage_change
  after insert or update on public.deals
  for each row execute function public.record_deal_stage_change();

-- ---------------------------------------------------------------------------
-- Status and closed_at follow the stage
-- ---------------------------------------------------------------------------
-- Moving a card into the Won column is how a deal is won; nobody wants to then
-- remember to change a separate status field. The database keeps the two in
-- step so a report can trust either one.

create or replace function public.sync_deal_outcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_won  boolean;
  v_is_lost boolean;
begin
  select is_won, is_lost into v_is_won, v_is_lost
  from public.pipeline_stages
  where id = new.stage_id;

  if coalesce(v_is_won, false) then
    new.status := 'won';
    new.closed_at := coalesce(new.closed_at, now());
  elsif coalesce(v_is_lost, false) then
    new.status := 'lost';
    new.closed_at := coalesce(new.closed_at, now());
  else
    new.status := 'open';
    new.closed_at := null;
  end if;

  return new;
end;
$$;

create trigger deals_sync_outcome
  before insert or update on public.deals
  for each row execute function public.sync_deal_outcome();

-- ---------------------------------------------------------------------------
-- Soft delete guard
-- ---------------------------------------------------------------------------

create or replace function public.guard_deal_soft_delete()
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
    raise exception 'deals.workspace_id cannot be changed';
  end if;

  if (old.deleted_at is null) <> (new.deleted_at is null) then
    if not public.is_manager() then
      raise exception 'Only a manager or above can delete or restore a deal';
    end if;
  end if;

  return new;
end;
$$;

create trigger deals_guard_soft_delete
  before update on public.deals
  for each row execute function public.guard_deal_soft_delete();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.pipelines          enable row level security;
alter table public.pipeline_stages    enable row level security;
alter table public.deals              enable row level security;
alter table public.deal_stage_history enable row level security;

create policy "pipelines_select" on public.pipelines
  for select to authenticated
  using (workspace_id = public.auth_workspace_id());

create policy "pipelines_write_admin" on public.pipelines
  for all to authenticated
  using (workspace_id = public.auth_workspace_id() and public.is_admin())
  with check (workspace_id = public.auth_workspace_id() and public.is_admin());

create policy "pipeline_stages_select" on public.pipeline_stages
  for select to authenticated
  using (workspace_id = public.auth_workspace_id());

create policy "pipeline_stages_write_admin" on public.pipeline_stages
  for all to authenticated
  using (workspace_id = public.auth_workspace_id() and public.is_admin())
  with check (workspace_id = public.auth_workspace_id() and public.is_admin());

-- The rule from 0009, applied where it would otherwise have been repeated:
-- deletion is manager-only, so the SELECT policy must keep a deleted row
-- visible to a manager or the soft delete rejects its own result.
create policy "deals_select" on public.deals
  for select to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and (deleted_at is null or public.is_manager())
  );

create policy "deals_insert" on public.deals
  for insert to authenticated
  with check (workspace_id = public.auth_workspace_id());

create policy "deals_update" on public.deals
  for update to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

-- No DELETE policy. Invariant 6.

-- History is append-only, and only the trigger appends. No INSERT, UPDATE or
-- DELETE policy: nobody rewrites how a deal actually progressed.
create policy "deal_stage_history_select" on public.deal_stage_history
  for select to authenticated
  using (workspace_id = public.auth_workspace_id());

revoke all on public.pipelines          from anon;
revoke all on public.pipeline_stages    from anon;
revoke all on public.deals              from anon;
revoke all on public.deal_stage_history from anon;

grant select, insert, update, delete on public.pipelines to authenticated;
grant select, insert, update, delete on public.pipeline_stages to authenticated;
grant select, insert, update on public.deals to authenticated;
grant select on public.deal_stage_history to authenticated;

-- ---------------------------------------------------------------------------
-- A pipeline to start from
-- ---------------------------------------------------------------------------
-- A board with no stages is not a board. Seeded here rather than in seed.sql
-- because seed.sql has already run against the live project, and a first-run
-- experience should not depend on remembering to re-run it.

do $$
declare
  v_workspace uuid;
  v_pipeline  uuid;
begin
  select id into v_workspace from public.workspaces order by created_at limit 1;
  if v_workspace is null then
    return;
  end if;

  if exists (select 1 from public.pipelines where workspace_id = v_workspace) then
    return;
  end if;

  insert into public.pipelines (workspace_id, name, is_default, position)
  values (v_workspace, 'Sales', true, 0)
  returning id into v_pipeline;

  insert into public.pipeline_stages
    (workspace_id, pipeline_id, name, position, color, is_won, is_lost)
  values
    (v_workspace, v_pipeline, 'New enquiry',  0, '#64748b', false, false),
    (v_workspace, v_pipeline, 'Qualified',    1, '#3b82f6', false, false),
    (v_workspace, v_pipeline, 'Proposal sent',2, '#8b5cf6', false, false),
    (v_workspace, v_pipeline, 'Negotiation',  3, '#f59e0b', false, false),
    (v_workspace, v_pipeline, 'Won',          4, '#16a34a', true,  false),
    (v_workspace, v_pipeline, 'Lost',         5, '#dc2626', false, true);
end
$$;

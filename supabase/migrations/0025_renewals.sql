-- 0025_renewals.sql
-- Recurring services sold to clients: hosting, domains, tool licences.
--
-- Named for the question the page exists to answer — "what renews next, and
-- what have we missed" — rather than for the noun. The record is a
-- subscription; nobody opens this screen to browse subscriptions, they open it
-- because something is about to lapse. One name throughout beats a `renewals`
-- tab reading a `subscriptions` table.
--
-- `overdue` is deliberately NOT a column. It is `next_renewal_on < today` and a
-- stored copy would be wrong every morning until something wrote to the row.
--
-- Forward only. Never edit once applied.

create type public.renewal_category as enum (
  'hosting', 'domain', 'tool', 'ssl', 'email', 'maintenance', 'other'
);

create type public.renewal_status as enum ('active', 'cancelled', 'lapsed');

create type public.renewal_cycle as enum (
  'monthly', 'quarterly', 'half_yearly', 'yearly', 'biennial'
);

create table public.renewals (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id),

  -- Who took it. Null is allowed: a domain bought before the client existed in
  -- the CRM is still worth tracking.
  contact_id     uuid references public.contacts(id) on delete set null,
  project_id     uuid references public.projects(id) on delete set null,
  -- Which of our companies sold it.
  brand_id       uuid references public.brands(id) on delete set null,

  name           text not null,                    -- "Elementor Pro", "wallxer.com"
  category       public.renewal_category not null default 'other',
  vendor         text,                             -- "Hostinger", "Elementor"

  status         public.renewal_status not null default 'active',
  cycle          public.renewal_cycle not null default 'yearly',

  started_on     date not null default current_date,
  last_renewed_on date,
  next_renewal_on date not null,

  -- Minor units, like everywhere else money is stored here. `price` is what the
  -- client pays; `cost` is what we pay the vendor. Both optional — a tracker
  -- that refuses a row because nobody remembers the price is a tracker nobody
  -- fills in.
  currency       public.invoice_currency not null default 'BDT',
  price_minor    bigint,
  cost_minor     bigint,

  auto_renew     boolean not null default true,
  reminder_days  int not null default 14,

  login_url      text,
  notes          text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id) on delete set null,
  deleted_at     timestamptz,

  constraint renewals_name_present check (length(trim(name)) > 0),
  constraint renewals_price_sane check (
    price_minor is null or (price_minor >= 0 and price_minor <= 100000000000)
  ),
  constraint renewals_cost_sane check (
    cost_minor is null or (cost_minor >= 0 and cost_minor <= 100000000000)
  ),
  constraint renewals_reminder_sane check (reminder_days between 0 and 365),
  -- A renewal cannot be due before the thing started.
  constraint renewals_dates_ordered check (next_renewal_on >= started_on),
  constraint renewals_last_renewal_sane check (
    last_renewed_on is null or last_renewed_on >= started_on
  )
);

-- The list is always ordered by what is due next, so that is the index.
create index renewals_due_idx
  on public.renewals (workspace_id, next_renewal_on)
  where deleted_at is null and status = 'active';

create index renewals_contact_idx on public.renewals (contact_id) where deleted_at is null;
create index renewals_project_idx on public.renewals (project_id) where deleted_at is null;

create trigger renewals_set_updated_at
  before update on public.renewals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Renewing
-- ---------------------------------------------------------------------------
-- The date arithmetic lives in Postgres because JavaScript gets it wrong in a
-- way that only shows up at the end of a month: adding a month to 31 January
-- lands on 3 March in JS, and on 28 February here, which is what a billing
-- cycle actually does.
--
-- Rolls forward from the date that was due, not from today, so a renewal paid
-- three days late keeps its anniversary instead of drifting later every year.

create or replace function public.advance_renewal(p_id uuid)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace uuid := public.auth_workspace_id();
  v_next date;
begin
  if v_workspace is null then
    raise exception 'Not authorised';
  end if;

  update public.renewals
     set last_renewed_on = next_renewal_on,
         next_renewal_on = next_renewal_on + case cycle
           when 'monthly'     then interval '1 month'
           when 'quarterly'   then interval '3 months'
           when 'half_yearly' then interval '6 months'
           when 'yearly'      then interval '1 year'
           when 'biennial'    then interval '2 years'
         end,
         -- Renewing something marked lapsed is how it comes back.
         status = case when status = 'lapsed' then 'active' else status end
   where id = p_id
     and workspace_id = v_workspace
     and deleted_at is null
  returning next_renewal_on into v_next;

  if v_next is null then
    raise exception 'That renewal does not exist';
  end if;

  return v_next;
end;
$$;

revoke all on function public.advance_renewal(uuid) from public, anon;
grant execute on function public.advance_renewal(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Workspace-wide, like projects and credentials: this is operational work, and
-- the person who notices a domain is about to expire is not always the person
-- who holds the finance grant. Deleting stays with managers, as it does for
-- every record the business is made of.
--
-- The SELECT policy does not filter `deleted_at`: an UPDATE's resulting row
-- must still satisfy SELECT, or the soft delete is rejected for producing a row
-- the deleter may no longer read. Migrations 0009 and 0021.

alter table public.renewals enable row level security;

create policy "renewals_select" on public.renewals
  for select to authenticated
  using (workspace_id = public.auth_workspace_id());

create policy "renewals_insert" on public.renewals
  for insert to authenticated
  with check (workspace_id = public.auth_workspace_id());

create policy "renewals_update" on public.renewals
  for update to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

-- No DELETE policy. Invariant 6.

revoke all on public.renewals from anon;
grant select, insert, update on public.renewals to authenticated;

-- ---------------------------------------------------------------------------
-- Deleting is manager work
-- ---------------------------------------------------------------------------
-- Same shape as projects: the policy above is deliberately permissive and the
-- trigger decides who may actually soft delete, because a policy cannot tell a
-- delete from an edit.

create or replace function public.guard_renewal_edit()
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
    raise exception 'renewals.workspace_id cannot be changed';
  end if;

  if (old.deleted_at is null) <> (new.deleted_at is null) then
    if not public.is_manager() then
      raise exception 'Only a manager or above can delete or restore a renewal';
    end if;
  end if;

  return new;
end;
$$;

create trigger renewals_guard_edit
  before update on public.renewals
  for each row execute function public.guard_renewal_edit();

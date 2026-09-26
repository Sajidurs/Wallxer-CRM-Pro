-- 0019_finance.sql
-- Finance: income, expenses, and the reports built on them.
--
-- SYSTEM_DESIGN.md section 11 planned this as "a new `transactions` table,
-- `brand_id` and `project_id` foreign keys, new feature folder". That is what
-- this is, plus the access grant the module needs to exist at all.
--
-- Access is NOT a role. Section 4's roles are cumulative — granting a manager
-- the Finance module by promoting them to admin would also hand them user
-- management, which is not what "let my manager see finance" means. So finance
-- is a per-user grant that admins hold implicitly and anyone else can be given
-- explicitly.
--
-- Forward only. Never edit once applied.

-- ---------------------------------------------------------------------------
-- Who may see money
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column finance_access boolean not null default false;

comment on column public.profiles.finance_access is
  'Grants the Finance module to a non-admin. Admins and super admins always '
  'have it; this column is the exception list for everyone else.';

-- The profiles UPDATE policy lets a user edit their own row, which is how the
-- profile settings page works. Without this check, any member could grant
-- themselves the finance module with a single PATCH. The column is privileged,
-- so it belongs in the guard beside role and status.
--
-- Replaced wholesale rather than patched: the body below is 0002's, with one
-- new check appended.

create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining_super_admins int;
begin
  -- Lockout guard, applied to everyone including the service role. Promote a
  -- replacement before demoting or suspending the last super admin.
  if old.role = 'super_admin'
     and old.status = 'active'
     and (new.role <> 'super_admin' or new.status <> 'active')
  then
    select count(*) into v_remaining_super_admins
    from public.profiles
    where workspace_id = old.workspace_id
      and role = 'super_admin'
      and status = 'active'
      and id <> old.id;

    if v_remaining_super_admins = 0 then
      raise exception
        'Cannot demote or suspend the last active super admin. Promote another user first.';
    end if;
  end if;

  -- No JWT means the service role or a direct SQL session: that is how invites
  -- and seeding legitimately work, so the per-column checks below do not apply.
  if auth.uid() is null then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'profiles.id cannot be changed';
  end if;

  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'profiles.workspace_id cannot be changed';
  end if;

  if new.role is distinct from old.role
     and public.auth_role() is distinct from 'super_admin'
  then
    raise exception 'Only a super admin can change a user role';
  end if;

  if new.status is distinct from old.status and not public.is_admin() then
    raise exception 'Only an admin can change a user status';
  end if;

  if new.finance_access is distinct from old.finance_access
     and not public.is_admin()
  then
    raise exception 'Only an admin can grant or revoke finance access';
  end if;

  return new;
end;
$$;

-- security definer so the check does not depend on the caller being able to
-- read the profiles row, and search_path pinned — the lesson of 0007.
create or replace function public.has_finance_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and status = 'active'
      and finance_access
  );
$$;

revoke all on function public.has_finance_access() from public, anon;
grant execute on function public.has_finance_access() to authenticated;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

create type public.transaction_kind as enum ('income', 'expense');

create type public.payment_method as enum (
  'cash', 'bank_transfer', 'card', 'mobile_banking', 'cheque', 'other'
);

-- Categories are per kind: "Salaries" is never income and "Retainer" is never
-- an expense, and a single list would offer both everywhere.
create table public.transaction_categories (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),

  kind         public.transaction_kind not null,
  name         text not null,
  position     int not null default 0,
  is_active    boolean not null default true,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null,

  constraint transaction_categories_name_present check (length(trim(name)) > 0),
  unique (workspace_id, kind, name)
);

create index transaction_categories_lookup_idx
  on public.transaction_categories (workspace_id, kind, position)
  where is_active;

create trigger transaction_categories_set_updated_at
  before update on public.transaction_categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------

create table public.transactions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id),

  kind          public.transaction_kind not null,

  -- Integer poisha, never a float. 0.1 + 0.2 is not 0.3 in binary floating
  -- point, and a ledger that does not add up is worse than one that is
  -- tedious to enter. The sign lives in `kind`, so this is always positive.
  amount_poisha bigint not null,

  occurred_on   date not null,

  category_id   uuid references public.transaction_categories(id) on delete set null,
  brand_id      uuid references public.brands(id) on delete set null,
  project_id    uuid references public.projects(id) on delete set null,
  contact_id    uuid references public.contacts(id) on delete set null,

  payment_method public.payment_method not null default 'bank_transfer',
  reference     text,
  description   text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null,
  deleted_at    timestamptz,

  constraint transactions_amount_positive check (amount_poisha > 0),
  -- Roughly ten billion taka. A typo of a few extra zeroes should be refused
  -- at the door rather than quietly skewing every report.
  constraint transactions_amount_sane check (amount_poisha <= 1000000000000),
  constraint transactions_reference_length check (
    reference is null or length(reference) <= 200
  )
);

create index transactions_ledger_idx
  on public.transactions (workspace_id, occurred_on desc)
  where deleted_at is null;

create index transactions_report_idx
  on public.transactions (workspace_id, kind, occurred_on)
  where deleted_at is null;

create index transactions_project_idx
  on public.transactions (project_id)
  where deleted_at is null;

create index transactions_category_idx
  on public.transactions (category_id)
  where deleted_at is null;

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- One rule for both tables: you are in the workspace and you hold the grant.
--
-- The SELECT policy deliberately does not filter `deleted_at`. Migration 0009
-- was written because an UPDATE's new row must still satisfy the SELECT policy,
-- so a policy ending in `deleted_at is null` rejects the very soft delete it is
-- meant to allow. Queries filter deleted rows; the policy decides who may look.

alter table public.transactions          enable row level security;
alter table public.transaction_categories enable row level security;

create policy "transactions_select" on public.transactions
  for select to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and public.has_finance_access()
  );

create policy "transactions_insert" on public.transactions
  for insert to authenticated
  with check (
    workspace_id = public.auth_workspace_id()
    and public.has_finance_access()
  );

create policy "transactions_update" on public.transactions
  for update to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and public.has_finance_access()
  )
  with check (
    workspace_id = public.auth_workspace_id()
    and public.has_finance_access()
  );

-- No DELETE policy. Invariant 6, and money is the last thing that should
-- vanish without a trace.

create policy "transaction_categories_select" on public.transaction_categories
  for select to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and public.has_finance_access()
  );

create policy "transaction_categories_insert" on public.transaction_categories
  for insert to authenticated
  with check (
    workspace_id = public.auth_workspace_id()
    and public.has_finance_access()
  );

create policy "transaction_categories_update" on public.transaction_categories
  for update to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and public.has_finance_access()
  )
  with check (
    workspace_id = public.auth_workspace_id()
    and public.has_finance_access()
  );

revoke all on public.transactions           from anon;
revoke all on public.transaction_categories from anon;

grant select, insert, update on public.transactions           to authenticated;
grant select, insert, update on public.transaction_categories to authenticated;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
-- Plain `stable` functions, NOT security definer: they run as the caller, so
-- the policies above filter what they can see. A security-definer aggregate
-- would have been a hole straight through the grant.
--
-- Aggregating in Postgres rather than in JavaScript keeps a year of ledger from
-- crossing the wire to draw twelve bars.

create or replace function public.finance_series(
  p_from   date,
  p_to     date,
  p_bucket text
)
returns table (
  bucket         date,
  income_poisha  bigint,
  expense_poisha bigint
)
language sql
stable
as $$
  select
    date_trunc(p_bucket, t.occurred_on)::date as bucket,
    coalesce(sum(t.amount_poisha) filter (where t.kind = 'income'), 0)::bigint,
    coalesce(sum(t.amount_poisha) filter (where t.kind = 'expense'), 0)::bigint
  from public.transactions t
  where t.deleted_at is null
    and t.occurred_on between p_from and p_to
  group by 1
  order by 1;
$$;

create or replace function public.finance_by_category(
  p_from date,
  p_to   date
)
returns table (
  category_id   uuid,
  category_name text,
  kind          public.transaction_kind,
  total_poisha  bigint
)
language sql
stable
as $$
  select
    t.category_id,
    coalesce(c.name, 'Uncategorised') as category_name,
    t.kind,
    sum(t.amount_poisha)::bigint
  from public.transactions t
  left join public.transaction_categories c on c.id = t.category_id
  where t.deleted_at is null
    and t.occurred_on between p_from and p_to
  group by t.category_id, c.name, t.kind
  order by 4 desc;
$$;

create or replace function public.finance_by_project(
  p_from date,
  p_to   date
)
returns table (
  project_id     uuid,
  project_name   text,
  income_poisha  bigint,
  expense_poisha bigint
)
language sql
stable
as $$
  select
    t.project_id,
    coalesce(p.name, 'No project') as project_name,
    coalesce(sum(t.amount_poisha) filter (where t.kind = 'income'), 0)::bigint,
    coalesce(sum(t.amount_poisha) filter (where t.kind = 'expense'), 0)::bigint
  from public.transactions t
  left join public.projects p on p.id = t.project_id
  where t.deleted_at is null
    and t.occurred_on between p_from and p_to
  group by t.project_id, p.name
  order by 3 desc;
$$;

revoke all on function public.finance_series(date, date, text)  from public, anon;
revoke all on function public.finance_by_category(date, date)   from public, anon;
revoke all on function public.finance_by_project(date, date)    from public, anon;

grant execute on function public.finance_series(date, date, text) to authenticated;
grant execute on function public.finance_by_category(date, date)  to authenticated;
grant execute on function public.finance_by_project(date, date)   to authenticated;

-- ---------------------------------------------------------------------------
-- Default categories
-- ---------------------------------------------------------------------------
-- Seeded per workspace so the first transaction form is not an empty dropdown.
-- Editable and deactivatable afterwards; nothing here is load bearing.

insert into public.transaction_categories (workspace_id, kind, name, position)
select w.id, seed.kind, seed.name, seed.position
from public.workspaces w
cross join (values
  ('income'::public.transaction_kind,  'Client payment',          10),
  ('income'::public.transaction_kind,  'Retainer',                20),
  ('income'::public.transaction_kind,  'Consulting',              30),
  ('income'::public.transaction_kind,  'Other income',            90),
  ('expense'::public.transaction_kind, 'Salaries',                10),
  ('expense'::public.transaction_kind, 'Contractors',             20),
  ('expense'::public.transaction_kind, 'Software & subscriptions', 30),
  ('expense'::public.transaction_kind, 'Advertising',             40),
  ('expense'::public.transaction_kind, 'Office & utilities',      50),
  ('expense'::public.transaction_kind, 'Travel',                  60),
  ('expense'::public.transaction_kind, 'Equipment',               70),
  ('expense'::public.transaction_kind, 'Bank & payment fees',     80),
  ('expense'::public.transaction_kind, 'Taxes',                   85),
  ('expense'::public.transaction_kind, 'Other expense',           90)
) as seed(kind, name, position)
on conflict (workspace_id, kind, name) do nothing;

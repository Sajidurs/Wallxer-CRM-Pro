-- 0026_proposals.sql
-- Proposals: what you send a client before the work, and before the invoice.
--
-- Shaped deliberately like `invoices`, because it is the same document at an
-- earlier moment: the same letterhead, the same client, the same priced lines.
-- An accepted proposal therefore already holds everything an invoice needs.
--
-- By decision: no public link. A proposal is printed or saved as PDF and sent
-- by whatever the agency already uses, so there is no anonymous route, no share
-- token, and nothing that can leak by being guessed.
--
-- The body is six fixed sections rather than free text. A section left blank
-- does not print, so the structure costs nothing when it is not wanted.
--
-- Purely additive: one enum, one column on `brands`, two new tables. No
-- existing row is touched.
--
-- Forward only. Never edit once applied.

create type public.proposal_status as enum (
  'draft', 'sent', 'accepted', 'declined'
);

-- Proposals count separately from invoices, or sending a proposal would burn an
-- invoice number and leave a gap in the books.
alter table public.brands
  add column proposal_counter int not null default 0;

comment on column public.brands.proposal_counter is
  'Last proposal number issued by this company. Separate from invoice_counter '
  'so a proposal never consumes an invoice number.';

create table public.proposals (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id),

  -- `restrict`, as with invoices: deleting a company that has issued documents
  -- would orphan the letterhead they went out under.
  brand_id      uuid not null references public.brands(id) on delete restrict,
  contact_id    uuid references public.contacts(id) on delete set null,
  project_id    uuid references public.projects(id) on delete set null,

  number        text not null,
  title         text not null,
  status        public.proposal_status not null default 'draft',
  currency      public.invoice_currency not null default 'BDT',

  issue_date    date not null default current_date,
  valid_until   date,

  -- The six sections. Each optional; an empty one is simply not printed.
  overview      text,
  scope         text,
  deliverables  text,
  timeline      text,
  investment    text,
  terms         text,

  -- Same arithmetic as an invoice, so the figure the client accepted and the
  -- figure they are later billed cannot drift apart.
  tax_rate       numeric(5,2) not null default 0,
  tax_label      text,
  subtotal_minor bigint not null default 0,
  tax_minor      bigint not null default 0,
  total_minor    bigint not null default 0,

  -- Frozen when it stops being a draft, for the reason invoices freeze: a
  -- document somebody else is holding must not change under them.
  issuer_snapshot jsonb,
  client_snapshot jsonb,

  sent_at       timestamptz,
  decided_at    timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null,
  deleted_at    timestamptz,

  constraint proposals_number_present check (length(trim(number)) > 0),
  constraint proposals_title_present check (length(trim(title)) > 0),
  constraint proposals_tax_rate_sane check (tax_rate >= 0 and tax_rate <= 100),
  constraint proposals_dates_ordered check (
    valid_until is null or valid_until >= issue_date
  )
);

create unique index proposals_number_key
  on public.proposals (workspace_id, upper(number))
  where deleted_at is null;

create index proposals_list_idx
  on public.proposals (workspace_id, issue_date desc)
  where deleted_at is null;

create index proposals_contact_idx on public.proposals (contact_id) where deleted_at is null;
create index proposals_brand_idx on public.proposals (brand_id) where deleted_at is null;

create trigger proposals_set_updated_at
  before update on public.proposals
  for each row execute function public.set_updated_at();

create table public.proposal_items (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id),
  proposal_id       uuid not null references public.proposals(id) on delete cascade,

  description       text not null,
  quantity          numeric(12,3) not null default 1,
  unit_amount_minor bigint not null default 0,

  amount_minor      bigint generated always as (
                      round(quantity * unit_amount_minor)::bigint
                    ) stored,

  position          int not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint proposal_items_description_present check (length(trim(description)) > 0),
  constraint proposal_items_quantity_positive check (quantity > 0),
  constraint proposal_items_unit_sane check (
    unit_amount_minor >= 0 and unit_amount_minor <= 100000000000
  )
);

create index proposal_items_proposal_idx on public.proposal_items (proposal_id, position);

create trigger proposal_items_set_updated_at
  before update on public.proposal_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Totals
-- ---------------------------------------------------------------------------
-- Two triggers, one owner each, exactly as 0023 does for invoices: the items
-- own the subtotal, and the proposal derives tax and total from it.

create or replace function public.derive_proposal_total()
returns trigger
language plpgsql
as $$
begin
  new.tax_minor := round(new.subtotal_minor * new.tax_rate / 100)::bigint;
  new.total_minor := new.subtotal_minor + new.tax_minor;
  return new;
end;
$$;

create trigger proposals_derive_total
  before insert or update on public.proposals
  for each row execute function public.derive_proposal_total();

-- The DELETE branch returns before any reference to NEW, because PL/pgSQL
-- resolves record fields regardless of which branch runs. Migration 0016.
create or replace function public.sync_proposal_subtotal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal uuid;
begin
  if tg_op = 'DELETE' then
    v_proposal := old.proposal_id;
  else
    v_proposal := new.proposal_id;
  end if;

  update public.proposals
     set subtotal_minor = (
       select coalesce(sum(amount_minor), 0)
       from public.proposal_items
       where proposal_id = v_proposal
     )
   where id = v_proposal;

  return null;
end;
$$;

create trigger proposal_items_sync_subtotal
  after insert or update or delete on public.proposal_items
  for each row execute function public.sync_proposal_subtotal();

-- ---------------------------------------------------------------------------
-- Numbering
-- ---------------------------------------------------------------------------
-- `WLX-P0001`. The P keeps a proposal visibly distinct from an invoice at a
-- glance, which matters when both are sitting in a client's inbox.

create or replace function public.next_proposal_number(p_brand_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace uuid := public.auth_workspace_id();
  v_prefix    text;
  v_next      int;
begin
  if v_workspace is null then
    raise exception 'Not authorised';
  end if;

  update public.brands
     set proposal_counter = proposal_counter + 1
   where id = p_brand_id
     and workspace_id = v_workspace
  returning
    coalesce(
      nullif(trim(invoice_prefix), ''),
      upper(left(regexp_replace(name, '[^a-zA-Z]', '', 'g'), 3))
    ),
    proposal_counter
  into v_prefix, v_next;

  if v_prefix is null then
    raise exception 'That company does not exist';
  end if;

  return v_prefix || '-P' || lpad(v_next::text, 4, '0');
end;
$$;

revoke all on function public.next_proposal_number(uuid) from public, anon;
grant execute on function public.next_proposal_number(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Workspace-wide, like projects and renewals rather than like invoices.
-- Writing a proposal is sales work, and a member who can run a project should
-- be able to draft the document that wins it. Deleting stays with managers.
--
-- The SELECT policy does not filter `deleted_at`: an UPDATE's resulting row
-- must still satisfy SELECT, or the soft delete is rejected for producing a row
-- the deleter may no longer read. Migrations 0009 and 0021.

alter table public.proposals      enable row level security;
alter table public.proposal_items enable row level security;

create policy "proposals_select" on public.proposals
  for select to authenticated
  using (workspace_id = public.auth_workspace_id());

create policy "proposals_insert" on public.proposals
  for insert to authenticated
  with check (workspace_id = public.auth_workspace_id());

create policy "proposals_update" on public.proposals
  for update to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

-- No DELETE policy. Invariant 6.

create policy "proposal_items_select" on public.proposal_items
  for select to authenticated
  using (workspace_id = public.auth_workspace_id());

create policy "proposal_items_insert" on public.proposal_items
  for insert to authenticated
  with check (workspace_id = public.auth_workspace_id());

create policy "proposal_items_update" on public.proposal_items
  for update to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

-- A line is a line on a document, not history: removing one that was mistyped
-- should not leave a tombstone. Same reasoning as invoice_items in 0023.
create policy "proposal_items_delete" on public.proposal_items
  for delete to authenticated
  using (workspace_id = public.auth_workspace_id());

revoke all on public.proposals      from anon;
revoke all on public.proposal_items from anon;

grant select, insert, update on public.proposals to authenticated;
grant select, insert, update, delete on public.proposal_items to authenticated;

-- ---------------------------------------------------------------------------
-- Deleting is manager work
-- ---------------------------------------------------------------------------
-- The policy above is deliberately permissive; the trigger decides who may
-- actually soft delete, because a policy cannot tell a delete from an edit.
-- Same shape as projects and renewals.

create or replace function public.guard_proposal_edit()
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
    raise exception 'proposals.workspace_id cannot be changed';
  end if;

  if (old.deleted_at is null) <> (new.deleted_at is null) then
    if not public.is_manager() then
      raise exception 'Only a manager or above can delete or restore a proposal';
    end if;
  end if;

  return new;
end;
$$;

create trigger proposals_guard_edit
  before update on public.proposals
  for each row execute function public.guard_proposal_edit();

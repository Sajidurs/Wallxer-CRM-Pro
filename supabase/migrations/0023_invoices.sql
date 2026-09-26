-- 0023_invoices.sql
-- Invoices, and the company details they are issued from.
--
-- SYSTEM_DESIGN section 11 planned this as "`invoices` and `invoice_items`
-- tables". The other half is that a brand becomes a company: `brands` already
-- held a name and a colour for tagging, and an invoice needs the letterhead —
-- logo, address, contact details, bank account, tax id.
--
-- By decision: currency is chosen per invoice, tax is one optional rate per
-- invoice, numbers count up per company, and marking an invoice paid does NOT
-- touch the Finance ledger. Money is recorded when it lands, not when it is
-- promised.
--
-- Forward only. Never edit once applied.

-- ---------------------------------------------------------------------------
-- brands become companies
-- ---------------------------------------------------------------------------

alter table public.brands
  add column legal_name      text,
  add column email           text,
  add column phone           text,
  add column website         text,
  add column address         text,
  add column bank_details    text,
  add column tax_id          text,
  add column logo_path       text,
  add column invoice_prefix  text,
  -- Last number issued, not a count of invoices: a deleted invoice must not
  -- let the next one reuse its number.
  add column invoice_counter int not null default 0;

comment on column public.brands.legal_name is
  'The registered name for an invoice, when it differs from the trading name.';
comment on column public.brands.logo_path is
  'Storage object path in the private `brand-logos` bucket, signed on read.';

alter table public.brands
  add constraint brands_invoice_prefix_shape check (
    invoice_prefix is null
    or invoice_prefix ~ '^[A-Za-z0-9]{2,8}$'
  );

create unique index brands_invoice_prefix_key
  on public.brands (workspace_id, upper(invoice_prefix))
  where invoice_prefix is not null;

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------

create type public.invoice_status as enum ('draft', 'sent', 'paid', 'cancelled');
create type public.invoice_currency as enum ('BDT', 'USD', 'EUR', 'GBP');

create table public.invoices (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id),

  -- `restrict`: deleting a company that has issued invoices would orphan the
  -- letterhead they were issued under.
  brand_id      uuid not null references public.brands(id) on delete restrict,
  contact_id    uuid references public.contacts(id) on delete set null,
  project_id    uuid references public.projects(id) on delete set null,

  number        text not null,
  status        public.invoice_status not null default 'draft',
  currency      public.invoice_currency not null default 'BDT',

  issue_date    date not null default current_date,
  due_date      date,

  tax_rate      numeric(5,2) not null default 0,
  tax_label     text,

  -- Minor units, like the ledger. All four currencies have two decimal places,
  -- so one divisor works for every one of them.
  subtotal_minor bigint not null default 0,
  tax_minor      bigint not null default 0,
  total_minor    bigint not null default 0,

  notes         text,
  terms         text,

  -- Frozen when the invoice leaves draft. A sent invoice is a document someone
  -- else is holding; editing the company address afterwards must not rewrite
  -- history. While it is a draft these stay null and the live record is used.
  issuer_snapshot jsonb,
  client_snapshot jsonb,

  sent_at       timestamptz,
  paid_at       timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null,
  deleted_at    timestamptz,

  constraint invoices_number_present check (length(trim(number)) > 0),
  constraint invoices_tax_rate_sane check (tax_rate >= 0 and tax_rate <= 100),
  constraint invoices_dates_ordered check (due_date is null or due_date >= issue_date)
);

create unique index invoices_number_key
  on public.invoices (workspace_id, upper(number))
  where deleted_at is null;

create index invoices_list_idx
  on public.invoices (workspace_id, issue_date desc)
  where deleted_at is null;

create index invoices_brand_idx on public.invoices (brand_id) where deleted_at is null;
create index invoices_contact_idx on public.invoices (contact_id) where deleted_at is null;

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create table public.invoice_items (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id),
  invoice_id        uuid not null references public.invoices(id) on delete cascade,

  description       text not null,
  quantity          numeric(12,3) not null default 1,
  unit_amount_minor bigint not null default 0,

  -- Generated, so a line total can never disagree with the numbers beside it.
  amount_minor      bigint generated always as (
                      round(quantity * unit_amount_minor)::bigint
                    ) stored,

  position          int not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint invoice_items_description_present check (length(trim(description)) > 0),
  constraint invoice_items_quantity_positive check (quantity > 0),
  constraint invoice_items_unit_sane check (
    unit_amount_minor >= 0 and unit_amount_minor <= 100000000000
  )
);

create index invoice_items_invoice_idx on public.invoice_items (invoice_id, position);

create trigger invoice_items_set_updated_at
  before update on public.invoice_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Totals
-- ---------------------------------------------------------------------------
-- Two triggers with one owner each: the line items own the subtotal, and the
-- invoice derives tax and total from it. Neither writes the other's field, so
-- there is no order in which they can disagree.

create or replace function public.derive_invoice_total()
returns trigger
language plpgsql
as $$
begin
  new.tax_minor := round(new.subtotal_minor * new.tax_rate / 100)::bigint;
  new.total_minor := new.subtotal_minor + new.tax_minor;
  return new;
end;
$$;

create trigger invoices_derive_total
  before insert or update on public.invoices
  for each row execute function public.derive_invoice_total();

-- Referencing NEW on a DELETE raises, so the branch comes before any reference
-- rather than inside a coalesce — the lesson of migration 0016.
create or replace function public.sync_invoice_subtotal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice uuid;
begin
  if tg_op = 'DELETE' then
    v_invoice := old.invoice_id;
  else
    v_invoice := new.invoice_id;
  end if;

  update public.invoices
     set subtotal_minor = (
       select coalesce(sum(amount_minor), 0)
       from public.invoice_items
       where invoice_id = v_invoice
     )
   where id = v_invoice;

  return null;
end;
$$;

create trigger invoice_items_sync_subtotal
  after insert or update or delete on public.invoice_items
  for each row execute function public.sync_invoice_subtotal();

-- ---------------------------------------------------------------------------
-- Numbering
-- ---------------------------------------------------------------------------
-- One UPDATE ... RETURNING, so two people creating an invoice at the same
-- moment cannot be handed the same number. Counting existing invoices instead
-- would do exactly that, and would also reuse the number of a deleted one.

create or replace function public.next_invoice_number(p_brand_id uuid)
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

  if not public.has_finance_access() then
    raise exception 'You do not have access to invoicing';
  end if;

  update public.brands
     set invoice_counter = invoice_counter + 1
   where id = p_brand_id
     and workspace_id = v_workspace
  returning
    coalesce(
      nullif(trim(invoice_prefix), ''),
      -- A readable default when nobody has set one: the first three letters of
      -- the name, punctuation and spaces removed.
      upper(left(regexp_replace(name, '[^a-zA-Z]', '', 'g'), 3))
    ),
    invoice_counter
  into v_prefix, v_next;

  if v_prefix is null then
    raise exception 'That company does not exist';
  end if;

  return v_prefix || '-' || lpad(v_next::text, 4, '0');
end;
$$;

revoke all on function public.next_invoice_number(uuid) from public, anon;
grant execute on function public.next_invoice_number(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Invoices are revenue documents, so they sit behind the same grant as the
-- Finance module rather than being visible to the whole workspace. Widening
-- this later is one predicate in four places.
--
-- The SELECT policy does not filter `deleted_at`: an UPDATE's resulting row
-- must still satisfy SELECT, so a policy that hid deleted rows would reject the
-- soft delete that creates one. That is migration 0009, and again 0021.

alter table public.invoices      enable row level security;
alter table public.invoice_items enable row level security;

create policy "invoices_select" on public.invoices
  for select to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and public.has_finance_access()
  );

create policy "invoices_insert" on public.invoices
  for insert to authenticated
  with check (
    workspace_id = public.auth_workspace_id()
    and public.has_finance_access()
  );

create policy "invoices_update" on public.invoices
  for update to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and public.has_finance_access()
  )
  with check (
    workspace_id = public.auth_workspace_id()
    and public.has_finance_access()
  );

-- No DELETE policy on invoices. Invariant 6.

create policy "invoice_items_select" on public.invoice_items
  for select to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and public.has_finance_access()
  );

create policy "invoice_items_insert" on public.invoice_items
  for insert to authenticated
  with check (
    workspace_id = public.auth_workspace_id()
    and public.has_finance_access()
  );

create policy "invoice_items_update" on public.invoice_items
  for update to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and public.has_finance_access()
  )
  with check (
    workspace_id = public.auth_workspace_id()
    and public.has_finance_access()
  );

-- A line item is a line on a document, not history: removing one someone
-- mistyped should not leave a tombstone on the invoice. Same reasoning as
-- resource_links in 0012 and checklist items in 0018.
create policy "invoice_items_delete" on public.invoice_items
  for delete to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and public.has_finance_access()
  );

revoke all on public.invoices      from anon;
revoke all on public.invoice_items from anon;

grant select, insert, update on public.invoices to authenticated;
grant select, insert, update, delete on public.invoice_items to authenticated;

-- ---------------------------------------------------------------------------
-- Company logos
-- ---------------------------------------------------------------------------
-- Private, like every other bucket: SYSTEM_DESIGN 7.4 rules out public URLs,
-- so the logo on an invoice is a signed link generated per render.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-logos',
  'brand-logos',
  false,
  2097152,  -- 2 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Anyone in the workspace may read a logo — it appears on invoices they are
-- allowed to see — but only an admin may change one, because company details
-- live in Settings.
create policy "brand_logos_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'brand-logos'
    and (storage.foldername(name))[1] = public.auth_workspace_id()::text
  );

create policy "brand_logos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'brand-logos'
    and (storage.foldername(name))[1] = public.auth_workspace_id()::text
    and public.is_admin()
  );

create policy "brand_logos_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'brand-logos'
    and (storage.foldername(name))[1] = public.auth_workspace_id()::text
    and public.is_admin()
  );

create policy "brand_logos_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'brand-logos'
    and (storage.foldername(name))[1] = public.auth_workspace_id()::text
    and public.is_admin()
  );

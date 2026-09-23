-- 0004_contacts.sql
-- Phase 2. Contacts: people and companies. See SYSTEM_DESIGN.md section 5.2.
--
-- Forward only. Never edit once applied.

create type public.contact_type as enum ('person', 'company');

create table public.contacts (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id),
  brand_id          uuid references public.brands(id) on delete set null,
  type              public.contact_type not null default 'person',

  first_name        text,
  last_name         text,
  company_name      text,
  job_title         text,

  email             text,
  phone             text,
  whatsapp          text,
  website           text,

  address           jsonb not null default '{}'::jsonb,  -- street, city, state, country, postal
  source            text,                                -- referral, cold email, website
  status            text not null default 'active',      -- active, lead, inactive, archived
  tags              text[] not null default '{}',

  -- A person belongs to a company. Same table, because a company is a contact
  -- in its own right: it has an address, an owner, and its own deals.
  parent_contact_id uuid references public.contacts(id) on delete set null,
  owner_id          uuid references public.profiles(id) on delete set null,

  notes             text,
  custom_fields     jsonb not null default '{}'::jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null,
  deleted_at        timestamptz,

  -- A person needs a name, a company needs a company name. Without this a row
  -- can exist that renders as an empty string everywhere in the UI.
  constraint contacts_name_present check (
    (type = 'person'  and (coalesce(first_name, '') <> '' or coalesce(last_name, '') <> ''))
    or
    (type = 'company' and coalesce(company_name, '') <> '')
  ),

  constraint contacts_not_own_parent check (parent_contact_id is distinct from id)
);

comment on column public.contacts.custom_fields is
  'The pressure valve. Fields that prove permanent get promoted to real columns.';

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------
-- The design specified an expression index. A stored generated column does the
-- same work but can be queried through PostgREST directly
-- (`.textSearch('search_vector', ...)`), where an expression index requires the
-- query to reproduce the expression exactly — which PostgREST cannot do.
--
-- 'simple' rather than 'english': these are names and companies, and stemming
-- "Rahman" or "Boost" helps nobody.

alter table public.contacts
  add column search_vector tsvector
  generated always as (
    to_tsvector(
      'simple',
      coalesce(first_name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(company_name, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(phone, '') || ' ' ||
      coalesce(job_title, '')
    )
  ) stored;

create index contacts_search_idx on public.contacts using gin (search_vector);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index contacts_workspace_idx on public.contacts (workspace_id) where deleted_at is null;
create index contacts_brand_idx     on public.contacts (brand_id);
create index contacts_owner_idx     on public.contacts (owner_id);
create index contacts_parent_idx    on public.contacts (parent_contact_id);
create index contacts_status_idx    on public.contacts (workspace_id, status) where deleted_at is null;
create index contacts_tags_idx      on public.contacts using gin (tags);

-- Sort key for the default list view. Included so pagination does not fall back
-- to a sequential scan once the imported contact lists land in Phase 7.
create index contacts_created_idx on public.contacts (workspace_id, created_at desc)
  where deleted_at is null;

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Soft delete guard
-- ---------------------------------------------------------------------------
-- Deleting is an UPDATE that sets deleted_at, so the UPDATE policy alone cannot
-- separate "a member edited a phone number" from "a member deleted the client".
-- This trigger draws that line. Section 4: members create and edit but do not
-- delete; manager and above do.

create or replace function public.guard_contact_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    if not public.is_manager() then
      raise exception 'Only a manager or above can delete a contact';
    end if;
  end if;

  if old.deleted_at is not null and new.deleted_at is null then
    if not public.is_manager() then
      raise exception 'Only a manager or above can restore a contact';
    end if;
  end if;

  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'contacts.workspace_id cannot be changed';
  end if;

  return new;
end;
$$;

create trigger contacts_guard_soft_delete
  before update on public.contacts
  for each row execute function public.guard_contact_soft_delete();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.contacts enable row level security;

-- Deleted rows stay visible to manager and above, so an "Undo" immediately
-- after a delete, and a trash view later, are possible without the service
-- role. Everyone else sees only live rows, and every query still filters
-- `deleted_at is null` explicitly rather than relying on this.
create policy "contacts_select_own_workspace" on public.contacts
  for select to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and (deleted_at is null or public.is_manager())
  );

create policy "contacts_insert_own_workspace" on public.contacts
  for insert to authenticated
  with check (workspace_id = public.auth_workspace_id());

create policy "contacts_update_own_workspace" on public.contacts
  for update to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

-- No DELETE policy, deliberately. SYSTEM_DESIGN section 0 invariant: nothing is
-- hard deleted. Client and project history is the point of a CRM, so removal is
-- always `deleted_at`, guarded above. A genuine purge is a service-role job.

revoke all on public.contacts from anon;
grant select, insert, update on public.contacts to authenticated;

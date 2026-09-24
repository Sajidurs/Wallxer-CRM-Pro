-- 0012_resource_links.sql
-- Phase 4. Named URLs, attachable to anything. See SYSTEM_DESIGN.md 5.6.
--
-- Recorded walkthroughs (Loom), Google Docs, Figma files, spec sheets. The
-- task form's repeatable links section is what this was written for, but like
-- `attachments` it is keyed on (entity_type, entity_id) rather than on tasks,
-- so projects and contacts get it for free and invoices will too.
--
-- Deliberately shaped like 0008 rather than inventing a second pattern: same
-- polymorphic columns, same entity_type check, same workspace scoping.
--
-- Forward only. Never edit once applied.

create type public.link_kind as enum
  ('video', 'document', 'design', 'repository', 'reference');

create table public.resource_links (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),

  entity_type  text not null,
  entity_id    uuid not null,

  kind         public.link_kind not null default 'reference',
  name         text not null,
  url          text not null,
  position     int not null default 0,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null,

  constraint resource_links_name_present check (length(trim(name)) > 0),
  constraint resource_links_url_scheme check (url ~* '^https?://'),
  constraint resource_links_entity_type_known check (
    entity_type in ('contact', 'deal', 'project', 'task', 'credential')
  )
);

create index resource_links_entity_idx on public.resource_links (entity_type, entity_id, position);

create trigger resource_links_set_updated_at
  before update on public.resource_links
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- No soft delete here, and so none of the SELECT-policy trap from 0009. A link
-- is a pointer, not history: removing a mistyped URL should not leave a
-- tombstone, and nothing is lost that cannot be pasted again.

alter table public.resource_links enable row level security;

create policy "resource_links_select" on public.resource_links
  for select to authenticated
  using (workspace_id = public.auth_workspace_id());

create policy "resource_links_insert" on public.resource_links
  for insert to authenticated
  with check (
    workspace_id = public.auth_workspace_id()
    and (created_by is null or created_by = auth.uid())
  );

create policy "resource_links_update" on public.resource_links
  for update to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

create policy "resource_links_delete" on public.resource_links
  for delete to authenticated
  using (workspace_id = public.auth_workspace_id());

revoke all on public.resource_links from anon;
grant select, insert, update, delete on public.resource_links to authenticated;

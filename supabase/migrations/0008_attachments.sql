-- 0008_attachments.sql
-- Phase 3, part three. The first shared polymorphic subsystem.
-- See SYSTEM_DESIGN.md 5.6 and 7.4.
--
-- This table attaches to any entity through (entity_type, entity_id). When
-- Invoices arrive, adding 'invoice' to ENTITY_TYPES in lib/entities.ts gives
-- them file uploads with no migration at all. That is the whole point of the
-- polymorphic design, and this is the migration that proves it.
--
-- Forward only. Never edit once applied.

create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),

  -- Text, not an enum, deliberately. Section 5.7: adding a module must not
  -- require altering a type that four tables depend on. lib/entities.ts is
  -- where the allowed values actually live.
  entity_type  text not null,
  entity_id    uuid not null,

  bucket       text not null default 'project-files',
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,

  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null,
  deleted_at   timestamptz,

  constraint attachments_file_name_present check (length(trim(file_name)) > 0),
  -- 25 MB, matching the limit the upload route enforces. Belt and braces: the
  -- route can be bypassed, the constraint cannot.
  constraint attachments_size_sane check (size_bytes is null or size_bytes <= 26214400),
  constraint attachments_entity_type_known check (
    entity_type in ('contact', 'deal', 'project', 'task', 'credential')
  )
);

create index attachments_entity_idx on public.attachments (entity_type, entity_id)
  where deleted_at is null;
create index attachments_workspace_idx on public.attachments (workspace_id)
  where deleted_at is null;

-- One storage object, one row. Without this, a retried upload leaves an orphan
-- row pointing at a file the first attempt already wrote.
create unique index attachments_storage_path_key
  on public.attachments (bucket, storage_path);

-- ---------------------------------------------------------------------------
-- Soft delete guard
-- ---------------------------------------------------------------------------
-- Looser than contacts and projects on purpose: whoever uploaded a file may
-- remove it, because uploading the wrong file is an ordinary mistake and
-- needing a manager to undo it is friction with no safety benefit. Everyone
-- else needs to be a manager.

create or replace function public.guard_attachment_soft_delete()
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
    if not public.is_manager() and old.created_by is distinct from auth.uid() then
      raise exception 'You can only remove files you uploaded';
    end if;
  end if;

  if new.workspace_id is distinct from old.workspace_id
     or new.storage_path is distinct from old.storage_path
     or new.bucket is distinct from old.bucket
  then
    raise exception 'An attachment cannot be repointed at a different file';
  end if;

  return new;
end;
$$;

create trigger attachments_guard_soft_delete
  before update on public.attachments
  for each row execute function public.guard_attachment_soft_delete();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.attachments enable row level security;

create policy "attachments_select_own_workspace" on public.attachments
  for select to authenticated
  using (workspace_id = public.auth_workspace_id() and deleted_at is null);

create policy "attachments_insert_own_workspace" on public.attachments
  for insert to authenticated
  with check (workspace_id = public.auth_workspace_id());

create policy "attachments_update_own_workspace" on public.attachments
  for update to authenticated
  using (workspace_id = public.auth_workspace_id())
  with check (workspace_id = public.auth_workspace_id());

-- No DELETE policy. Invariant 6 again.

revoke all on public.attachments from anon;
grant select, insert, update on public.attachments to authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
-- Both private. Section 7.4: no public URLs anywhere, downloads use short lived
-- signed URLs generated on demand.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files',
  'project-files',
  false,
  26214400,  -- 25 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml'
  ]
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152,   -- 2 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Storage policies
-- ---------------------------------------------------------------------------
-- Paths are {workspace_id}/{entity_type}/{entity_id}/{uuid}-{filename}, so the
-- first path segment is the workspace. Matching on it is what stops a valid
-- user reading another workspace's files by guessing an object name.
--
-- storage.foldername() returns the path segments as an array; element 1 is the
-- first folder.

create policy "project_files_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = public.auth_workspace_id()::text
  );

create policy "project_files_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = public.auth_workspace_id()::text
  );

create policy "project_files_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'project-files'
    and (storage.foldername(name))[1] = public.auth_workspace_id()::text
    and public.is_manager()
  );

create policy "avatars_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.auth_workspace_id()::text
  );

create policy "avatars_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.auth_workspace_id()::text
  );

create policy "avatars_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.auth_workspace_id()::text
  );

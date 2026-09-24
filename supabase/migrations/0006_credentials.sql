-- 0006_credentials.sql
-- Phase 3, part two. Encrypted credentials and the access log that makes
-- shared access accountable. See SYSTEM_DESIGN.md 7.3.
--
-- DEVIATION FROM THE DESIGN, recorded in the Decision Log: section 7.3
-- specifies pgsodium. pgsodium is deprecated by Supabase and is not installed
-- on this project. This uses pgcrypto, which is installed, with the key held in
-- Supabase Vault, which is also installed. The function boundary, the access
-- log, and the frontend rules are all exactly as designed.
--
-- Forward only. Never edit once applied.

create type public.credential_category as enum
  ('hosting', 'domain', 'cms', 'ftp', 'database', 'email', 'analytics', 'social', 'other');

-- ---------------------------------------------------------------------------
-- The encryption key
-- ---------------------------------------------------------------------------
-- Generated here, randomly, inside the database. It is never written to a
-- migration file, an environment variable, or a repository, and there is no
-- copy of it for anyone to leak. Supabase Vault encrypts it at rest with a root
-- key held outside the database, so a pg_dump contains ciphertext and nothing
-- that can decrypt it.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'credential_encryption_key') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'base64'),
      'credential_encryption_key',
      'Symmetric key for public.credentials. Generated 0006. Rotating it requires re-encrypting every row.'
    );
  end if;
end
$$;

-- Reads the key. security definer and granted to nobody: only the functions
-- below can reach it, and they run as the owner. If this is ever callable by
-- `authenticated`, the encryption is decorative.
create or replace function public.credential_key()
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'credential_encryption_key'
$$;

revoke all on function public.credential_key() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.credentials (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id),
  project_id       uuid references public.projects(id) on delete cascade,
  contact_id       uuid references public.contacts(id) on delete set null,

  label            text not null,                  -- "cPanel - main hosting"
  category         public.credential_category not null default 'other',
  url              text,
  username         text,                           -- not secret, stored plainly

  secret_encrypted bytea not null,                 -- the password
  notes_encrypted  bytea,                          -- recovery codes, API keys

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.profiles(id) on delete set null,
  deleted_at       timestamptz,

  constraint credentials_label_present check (length(trim(label)) > 0)
);

create index credentials_project_idx   on public.credentials (project_id) where deleted_at is null;
create index credentials_contact_idx   on public.credentials (contact_id);
create index credentials_workspace_idx on public.credentials (workspace_id) where deleted_at is null;

create trigger credentials_set_updated_at
  before update on public.credentials
  for each row execute function public.set_updated_at();

-- Every reveal is recorded. Because the whole team can reveal, this log is the
-- accountability mechanism rather than the permission being.
create table public.credential_access_log (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id),
  credential_id uuid not null references public.credentials(id) on delete cascade,
  user_id       uuid not null references public.profiles(id),
  action        text not null,                     -- reveal, create, update, delete
  ip            inet,
  created_at    timestamptz not null default now()
);

create index credential_access_log_credential_idx
  on public.credential_access_log (credential_id, created_at desc);
create index credential_access_log_user_idx
  on public.credential_access_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Write and read functions
-- ---------------------------------------------------------------------------
-- All access goes through these. The tables themselves never hand a plaintext
-- secret to anyone, and the ciphertext columns are not even selectable by
-- `authenticated` (see the column grants at the bottom).

create or replace function public.create_credential(
  p_project_id uuid,
  p_label      text,
  p_category   public.credential_category,
  p_url        text,
  p_username   text,
  p_secret     text,
  p_notes      text default null,
  p_contact_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace uuid := public.auth_workspace_id();
  v_user      uuid := auth.uid();
  v_key       text := public.credential_key();
  v_id        uuid;
begin
  if v_workspace is null then
    raise exception 'Not authorised';
  end if;

  -- Members may read and reveal, but creating a credential is a manager job.
  if not public.is_manager() then
    raise exception 'Only a manager or above can add a credential';
  end if;

  if p_secret is null or length(p_secret) = 0 then
    raise exception 'A credential needs a secret';
  end if;

  -- The project must be one the caller can actually see. Without this check a
  -- valid user could attach a credential to another workspace's project by id.
  if p_project_id is not null and not exists (
    select 1 from public.projects
    where id = p_project_id and workspace_id = v_workspace and deleted_at is null
  ) then
    raise exception 'That project does not exist';
  end if;

  insert into public.credentials (
    workspace_id, project_id, contact_id, label, category, url, username,
    secret_encrypted, notes_encrypted, created_by
  )
  values (
    v_workspace, p_project_id, p_contact_id, p_label, p_category, p_url, p_username,
    pgp_sym_encrypt(p_secret, v_key),
    case when p_notes is null or length(p_notes) = 0
         then null else pgp_sym_encrypt(p_notes, v_key) end,
    v_user
  )
  returning id into v_id;

  insert into public.credential_access_log (workspace_id, credential_id, user_id, action)
  values (v_workspace, v_id, v_user, 'create');

  return v_id;
end;
$$;

create or replace function public.update_credential(
  p_id         uuid,
  p_label      text,
  p_category   public.credential_category,
  p_url        text,
  p_username   text,
  -- Null means "leave the stored value alone", so editing a label does not
  -- require the editor to know the password.
  p_secret     text default null,
  p_notes      text default null,
  p_clear_notes boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace uuid := public.auth_workspace_id();
  v_user      uuid := auth.uid();
  v_key       text := public.credential_key();
begin
  if v_workspace is null then
    raise exception 'Not authorised';
  end if;

  if not public.is_manager() then
    raise exception 'Only a manager or above can edit a credential';
  end if;

  update public.credentials
     set label    = p_label,
         category = p_category,
         url      = p_url,
         username = p_username,
         secret_encrypted = case
           when p_secret is null or length(p_secret) = 0 then secret_encrypted
           else pgp_sym_encrypt(p_secret, v_key)
         end,
         notes_encrypted = case
           when p_clear_notes then null
           when p_notes is null or length(p_notes) = 0 then notes_encrypted
           else pgp_sym_encrypt(p_notes, v_key)
         end
   where id = p_id
     and workspace_id = v_workspace
     and deleted_at is null;

  if not found then
    raise exception 'That credential does not exist';
  end if;

  insert into public.credential_access_log (workspace_id, credential_id, user_id, action)
  values (v_workspace, p_id, v_user, 'update');
end;
$$;

-- The only way to read a secret.
--
-- The log row is written BEFORE the plaintext is returned, in the same
-- transaction, so a reveal that succeeds is always a reveal that was recorded.
-- That ordering is the whole design: the team is trusted with access, and the
-- log is what makes that trust accountable.
create or replace function public.reveal_credential(p_credential_id uuid)
returns table (username text, secret text, notes text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace uuid := public.auth_workspace_id();
  v_user      uuid := auth.uid();
  v_key       text := public.credential_key();
  v_row       public.credentials;
begin
  if v_workspace is null then
    raise exception 'Not authorised';
  end if;

  select * into v_row
  from public.credentials
  where id = p_credential_id
    and workspace_id = v_workspace
    and deleted_at is null;

  if not found then
    raise exception 'That credential does not exist';
  end if;

  insert into public.credential_access_log (workspace_id, credential_id, user_id, action)
  values (v_workspace, p_credential_id, v_user, 'reveal');

  return query
  select
    v_row.username,
    pgp_sym_decrypt(v_row.secret_encrypted, v_key),
    case when v_row.notes_encrypted is null then null
         else pgp_sym_decrypt(v_row.notes_encrypted, v_key) end;
end;
$$;

create or replace function public.delete_credential(p_id uuid, p_deleted boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace uuid := public.auth_workspace_id();
  v_user      uuid := auth.uid();
begin
  if v_workspace is null then
    raise exception 'Not authorised';
  end if;

  if not public.is_manager() then
    raise exception 'Only a manager or above can delete a credential';
  end if;

  update public.credentials
     set deleted_at = case when p_deleted then now() else null end
   where id = p_id and workspace_id = v_workspace;

  if not found then
    raise exception 'That credential does not exist';
  end if;

  insert into public.credential_access_log (workspace_id, credential_id, user_id, action)
  values (v_workspace, p_id, v_user, case when p_deleted then 'delete' else 'restore' end);
end;
$$;

revoke all on function public.create_credential(uuid, text, public.credential_category, text, text, text, text, uuid) from public, anon;
revoke all on function public.update_credential(uuid, text, public.credential_category, text, text, text, text, boolean) from public, anon;
revoke all on function public.reveal_credential(uuid) from public, anon;
revoke all on function public.delete_credential(uuid, boolean) from public, anon;

grant execute on function public.create_credential(uuid, text, public.credential_category, text, text, text, text, uuid) to authenticated;
grant execute on function public.update_credential(uuid, text, public.credential_category, text, text, text, text, boolean) to authenticated;
grant execute on function public.reveal_credential(uuid) to authenticated;
grant execute on function public.delete_credential(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security and column grants
-- ---------------------------------------------------------------------------

alter table public.credentials           enable row level security;
alter table public.credential_access_log enable row level security;

create policy "credentials_select_own_workspace" on public.credentials
  for select to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and (deleted_at is null or public.is_manager())
  );

-- No INSERT, UPDATE, or DELETE policy at all. Writes happen only through the
-- security definer functions above, which bypass RLS by design. A direct insert
-- would skip both the encryption and the access log.

create policy "credential_access_log_select" on public.credential_access_log
  for select to authenticated
  using (workspace_id = public.auth_workspace_id());

-- The log is append-only, and only the functions append to it. Nobody edits or
-- deletes an audit trail, including an admin.

revoke all on public.credentials           from anon, authenticated;
revoke all on public.credential_access_log from anon, authenticated;

-- Column-level grants: the ciphertext columns are not selectable at all. RLS
-- filters rows, not columns, so this is the only way to stop a client asking
-- for `secret_encrypted` directly. Even a brute-force attempt gets nothing to
-- work on.
grant select (
  id, workspace_id, project_id, contact_id, label, category, url, username,
  created_at, updated_at, created_by, deleted_at
) on public.credentials to authenticated;

grant select on public.credential_access_log to authenticated;

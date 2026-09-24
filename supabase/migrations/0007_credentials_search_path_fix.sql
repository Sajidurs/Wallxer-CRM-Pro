-- 0007_credentials_search_path_fix.sql
--
-- Fixes a bug in 0006: the credential functions called pgp_sym_encrypt and
-- pgp_sym_decrypt unqualified while pinning `search_path = public`. pgcrypto
-- lives in the `extensions` schema on Supabase, so every one of them failed
-- with "function pgp_sym_encrypt(text, text) does not exist" the moment it was
-- called by the application.
--
-- The fix is to schema-qualify the calls, NOT to widen the search_path. A
-- security definer function runs with the owner's privileges, so a permissive
-- search_path is how a caller tricks it into executing their function instead
-- of the intended one. Pinned and explicit is the safe combination.
--
-- 0006 is left untouched, as an applied migration must be.

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

  if not public.is_manager() then
    raise exception 'Only a manager or above can add a credential';
  end if;

  if p_secret is null or length(p_secret) = 0 then
    raise exception 'A credential needs a secret';
  end if;

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
    extensions.pgp_sym_encrypt(p_secret, v_key),
    case when p_notes is null or length(p_notes) = 0
         then null else extensions.pgp_sym_encrypt(p_notes, v_key) end,
    v_user
  )
  returning id into v_id;

  insert into public.credential_access_log (workspace_id, credential_id, user_id, action)
  values (v_workspace, v_id, v_user, 'create');

  return v_id;
end;
$$;

create or replace function public.update_credential(
  p_id          uuid,
  p_label       text,
  p_category    public.credential_category,
  p_url         text,
  p_username    text,
  p_secret      text default null,
  p_notes       text default null,
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
           else extensions.pgp_sym_encrypt(p_secret, v_key)
         end,
         notes_encrypted = case
           when p_clear_notes then null
           when p_notes is null or length(p_notes) = 0 then notes_encrypted
           else extensions.pgp_sym_encrypt(p_notes, v_key)
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

  -- Logged before the plaintext is produced, in the same transaction.
  insert into public.credential_access_log (workspace_id, credential_id, user_id, action)
  values (v_workspace, p_credential_id, v_user, 'reveal');

  return query
  select
    v_row.username,
    extensions.pgp_sym_decrypt(v_row.secret_encrypted, v_key),
    case when v_row.notes_encrypted is null then null
         else extensions.pgp_sym_decrypt(v_row.notes_encrypted, v_key) end;
end;
$$;

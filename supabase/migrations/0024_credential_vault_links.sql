-- 0024_credential_vault_links.sql
-- A credential can now be a pointer to an external vault instead of the secret.
--
-- By decision: some client passwords should not live in this system at all.
-- Keeping them in a Google Sheet or Doc means a compromise of this application
-- yields a reference rather than a password, and reaching the real thing needs
-- a Google account this system never holds.
--
-- The important choice here is that the link is stored *exactly like a secret*
-- — encrypted with the same key, revealed through the same logged function,
-- never rendered into a page until someone asks for it. A plain `vault_url`
-- column would have put the URL in the clear in every backup and every row a
-- leaked key could read, which matters because a sheet shared as "anyone with
-- the link" makes that URL the credential.
--
-- So a link credential is a credential whose secret happens to be a URL, plus a
-- flag saying so. Everything already built for secrets applies unchanged:
-- pgcrypto, the access log, the 30-second reveal, the column grants that stop a
-- client asking for `secret_encrypted` directly.
--
-- Forward only. Never edit once applied.

create type public.credential_kind as enum ('stored', 'link');

alter table public.credentials
  add column kind public.credential_kind not null default 'stored';

comment on column public.credentials.kind is
  'stored: secret_encrypted holds the password. link: it holds the URL of an '
  'external vault (a Google Sheet or Doc) that holds the real credential.';

-- ---------------------------------------------------------------------------
-- The write functions gain a kind
-- ---------------------------------------------------------------------------
-- Dropped and recreated rather than `create or replace`, because adding a
-- parameter makes a new signature: replace would leave the old function beside
-- the new one and a named-argument call could match either.
--
-- Both bodies below are 0021's — the newest definition, not 0006's or 0007's.
-- 0020 exists because that distinction was missed once.

drop function if exists public.create_credential(
  uuid, text, public.credential_category, text, text, text, text, uuid
);

create or replace function public.create_credential(
  p_project_id uuid,
  p_label      text,
  p_category   public.credential_category,
  p_url        text,
  p_username   text,
  p_secret     text,
  p_notes      text default null,
  p_contact_id uuid default null,
  p_kind       public.credential_kind default 'stored'
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

  -- For a link this is the vault URL. Either way there is nothing to store
  -- without it.
  if p_secret is null or length(p_secret) = 0 then
    if p_kind = 'link' then
      raise exception 'A vault link needs a URL';
    else
      raise exception 'A credential needs a secret';
    end if;
  end if;

  if p_project_id is not null and not exists (
    select 1 from public.projects
    where id = p_project_id and workspace_id = v_workspace and deleted_at is null
  ) then
    raise exception 'That project does not exist';
  end if;

  insert into public.credentials (
    workspace_id, project_id, contact_id, label, category, kind, url, username,
    secret_encrypted, notes_encrypted, created_by
  )
  values (
    v_workspace, p_project_id, p_contact_id, p_label, p_category, p_kind, p_url, p_username,
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

drop function if exists public.update_credential(
  uuid, text, public.credential_category, text, text, text, text, boolean
);

create or replace function public.update_credential(
  p_id          uuid,
  p_label       text,
  p_category    public.credential_category,
  p_url         text,
  p_username    text,
  p_secret      text default null,
  p_notes       text default null,
  p_clear_notes boolean default false,
  p_kind        public.credential_kind default null
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

  update public.credentials
     set label    = p_label,
         category = p_category,
         -- null leaves it alone, so an edit that only fixes a label does not
         -- have to restate what kind of credential this is.
         kind     = coalesce(p_kind, kind),
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

revoke all on function public.create_credential(
  uuid, text, public.credential_category, text, text, text, text, uuid, public.credential_kind
) from public, anon;
revoke all on function public.update_credential(
  uuid, text, public.credential_category, text, text, text, text, boolean, public.credential_kind
) from public, anon;

grant execute on function public.create_credential(
  uuid, text, public.credential_category, text, text, text, text, uuid, public.credential_kind
) to authenticated;
grant execute on function public.update_credential(
  uuid, text, public.credential_category, text, text, text, text, boolean, public.credential_kind
) to authenticated;

-- `kind` is not a secret, so it joins the readable columns. Without this the
-- list cannot tell a vault link from a stored password.
grant select (kind) on public.credentials to authenticated;

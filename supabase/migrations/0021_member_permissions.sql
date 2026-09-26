-- 0021_member_permissions.sql
-- Members do the work; admins run the workspace.
--
-- By decision: a member may now edit and delete any task (and therefore manage
-- its checklist), and may add, edit and remove credentials. Deleting a whole
-- project, contact or deal stays with managers — the blast radius is larger and
-- nobody asked for it.
--
-- Section 4's table in SYSTEM_DESIGN.md is now out of date for `member`; this
-- migration is the authority until it is rewritten.
--
-- Every function below is replaced from its NEWEST definition, not its first:
-- create_credential and update_credential were last written in 0007, not 0006,
-- and rebuilding them from 0006 would silently restore the unqualified
-- pgcrypto calls that broke every credential write. Migration 0020 exists
-- because that exact mistake was made once already.
--
-- Forward only. Never edit once applied.

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
-- The assignment restriction is gone. What is left of the guard is the one rule
-- that was never about roles: a task cannot be moved between workspaces.

create or replace function public.guard_task_edit()
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
    raise exception 'tasks.workspace_id cannot be changed';
  end if;

  return new;
end;
$$;

-- The SELECT policy has to change with it, or the new permission cannot be
-- used. Postgres requires an UPDATE's resulting row to still satisfy SELECT,
-- so a policy ending in `deleted_at is null or is_manager()` rejects a member's
-- soft delete for producing a row that member may no longer read. That is the
-- bug migration 0009 was written for; the same shape would reappear here.
--
-- Deleted tasks are now readable by anyone in the workspace. Every query in the
-- application filters `deleted_at is null`; the policy decides who may look,
-- not what a list shows.

drop policy if exists "tasks_select_own_workspace" on public.tasks;

create policy "tasks_select_own_workspace" on public.tasks
  for select to authenticated
  using (workspace_id = public.auth_workspace_id());

-- A checklist belongs to its task, so it follows the same rule. Kept as a
-- function rather than inlined so the four policies in 0018 cannot drift apart,
-- and so tightening this later is one edit.

create or replace function public.can_edit_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and t.workspace_id = public.auth_workspace_id()
  );
$$;

-- ---------------------------------------------------------------------------
-- Credentials
-- ---------------------------------------------------------------------------
-- Members could already reveal a credential — that was settled in 0006, with
-- credential_access_log as the accountability rather than withholding access.
-- Letting them create and edit one exposes nothing that was not already
-- reachable, and every call still writes a log row.
--
-- Bodies below are 0007's (create, update) and 0006's (delete), with only the
-- is_manager() gate removed. The extensions.* qualification is load bearing:
-- pgcrypto lives in `extensions`, and search_path is pinned to public.

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

-- A member who deletes a credential must still be able to undo it. The
-- functions above are security definer and so reach the row regardless, but the
-- SELECT policy decides whether the interface can offer the undo at all.

drop policy if exists "credentials_select_own_workspace" on public.credentials;

create policy "credentials_select_own_workspace" on public.credentials
  for select to authenticated
  using (workspace_id = public.auth_workspace_id());

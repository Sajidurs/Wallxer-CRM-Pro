-- 0002_rls_helpers.sql
-- Phase 0. The helper functions every future policy calls, plus RLS on the
-- foundation tables. See SYSTEM_DESIGN.md section 7.2.
--
-- Policies call these helpers instead of comparing role strings inline, so a
-- permission change later edits one function rather than forty policies.

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
-- security definer on purpose: these read public.profiles from inside the very
-- policies that protect public.profiles. Running as the owner sidesteps the
-- recursion. search_path is pinned so a caller cannot shadow `profiles`.

-- Returns null for a suspended or invited user, which is what makes suspension
-- instant: every policy below compares against this, so null denies everything
-- without deleting a single row of that user's history.
create or replace function public.auth_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id
  from public.profiles
  where id = auth.uid()
    and status = 'active'
$$;

create or replace function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and status = 'active'
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select public.auth_role() in ('super_admin', 'admin')
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select public.auth_role() = 'super_admin'
$$;

-- manager and above: full CRUD on business records. See section 4.
create or replace function public.is_manager()
returns boolean
language sql
stable
set search_path = public
as $$
  select public.auth_role() in ('super_admin', 'admin', 'manager')
$$;

comment on function public.auth_workspace_id is
  'Workspace of the current user, or null if they are not an active profile. Every RLS policy compares against this.';

revoke execute on function public.auth_workspace_id() from public;
revoke execute on function public.auth_role() from public;
revoke execute on function public.is_admin() from public;
revoke execute on function public.is_super_admin() from public;
revoke execute on function public.is_manager() from public;

grant execute on function public.auth_workspace_id() to authenticated, service_role;
grant execute on function public.auth_role() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_super_admin() to authenticated, service_role;
grant execute on function public.is_manager() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privileged column guard on profiles
-- ---------------------------------------------------------------------------
-- An UPDATE policy cannot easily restrict a single column, so role, status, and
-- workspace_id are policed by a trigger instead.

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

  return new;
end;
$$;

create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.workspaces enable row level security;
alter table public.brands     enable row level security;
alter table public.profiles   enable row level security;

-- workspaces ----------------------------------------------------------------
-- Read your own. Only an admin changes settings. Nobody creates or deletes a
-- workspace through the app; that is a migration or an admin-client operation.

create policy "workspaces_select_own" on public.workspaces
  for select to authenticated
  using (id = public.auth_workspace_id());

create policy "workspaces_update_admin" on public.workspaces
  for update to authenticated
  using (id = public.auth_workspace_id() and public.is_admin())
  with check (id = public.auth_workspace_id());

-- brands --------------------------------------------------------------------

create policy "brands_select_own_workspace" on public.brands
  for select to authenticated
  using (workspace_id = public.auth_workspace_id());

create policy "brands_insert_admin" on public.brands
  for insert to authenticated
  with check (workspace_id = public.auth_workspace_id() and public.is_admin());

create policy "brands_update_admin" on public.brands
  for update to authenticated
  using (workspace_id = public.auth_workspace_id() and public.is_admin())
  with check (workspace_id = public.auth_workspace_id());

create policy "brands_delete_admin" on public.brands
  for delete to authenticated
  using (workspace_id = public.auth_workspace_id() and public.is_admin());

-- profiles ------------------------------------------------------------------
-- Everyone in the workspace can see their colleagues: the app shows assignee
-- and owner names everywhere. Writes are narrower.
--
-- There is deliberately no INSERT policy. Profiles are created only by the
-- handle_new_user trigger, which is security definer and so bypasses RLS.
-- There is deliberately no DELETE policy. Users are suspended, never deleted.

create policy "profiles_select_own_workspace" on public.profiles
  for select to authenticated
  using (workspace_id = public.auth_workspace_id());

create policy "profiles_update_self_or_admin" on public.profiles
  for update to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and (id = auth.uid() or public.is_admin())
  )
  with check (workspace_id = public.auth_workspace_id());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- RLS filters rows; grants decide whether the role may attempt the statement at
-- all. Both are needed. anon gets nothing: this app has no public surface.

revoke all on public.workspaces from anon;
revoke all on public.brands     from anon;
revoke all on public.profiles   from anon;

grant select, update on public.workspaces to authenticated;
grant select, insert, update, delete on public.brands to authenticated;
grant select, update on public.profiles to authenticated;

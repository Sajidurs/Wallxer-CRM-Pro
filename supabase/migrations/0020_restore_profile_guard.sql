-- 0020_restore_profile_guard.sql
-- Fix: 0019 rebuilt guard_profile_privileged_columns from the wrong ancestor.
--
-- The function is defined three times now — 0002 created it, 0003 replaced it
-- with an extended version, and 0019 needed one more check for finance_access.
-- 0019 copied 0002's body, not 0003's, which silently dropped everything 0003
-- had added:
--
--   * must_change_password became client-writable, so a user handed a temporary
--     password could clear the flag and skip the forced change entirely.
--   * invited_by and invited_at stopped being write-once.
--   * an admin could suspend themselves again, which is one of the two easy
--     ways to lock a workspace out of its own user management.
--
-- `create or replace function` has no notion of a base version to merge into;
-- it takes whatever body it is handed. Anything that replaces a function
-- defined in an earlier migration has to start from the newest definition, and
-- the only way to be sure which that is, is to grep for every occurrence.
--
-- `verify:rls` caught this — "member cannot set must_change_password" began
-- failing in the same run that added the finance checks.
--
-- Forward only. Never edit once applied.

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

  if new.status is distinct from old.status then
    if not public.is_admin() then
      raise exception 'Only an admin can change a user status';
    end if;

    if old.id = auth.uid() and new.status <> 'active' then
      raise exception 'You cannot suspend your own account';
    end if;
  end if;

  -- The password change is lifted by the setPassword server action, which runs
  -- with the service role and therefore skips this whole block.
  if new.must_change_password is distinct from old.must_change_password then
    raise exception 'must_change_password is set by the server, not by the client';
  end if;

  if new.invited_by is distinct from old.invited_by
     or new.invited_at is distinct from old.invited_at
  then
    raise exception 'Invite provenance cannot be rewritten';
  end if;

  -- From 0019: the finance grant is privileged for the same reason role and
  -- status are. profiles_update_self_or_admin lets anyone edit their own row.
  if new.finance_access is distinct from old.finance_access
     and not public.is_admin()
  then
    raise exception 'Only an admin can grant or revoke finance access';
  end if;

  return new;
end;
$$;

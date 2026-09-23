-- 0003_users_management.sql
-- Phase 1. What the Users module needs beyond the foundation.
--
-- Forward only. Never edit once applied.

-- ---------------------------------------------------------------------------
-- profiles: new columns
-- ---------------------------------------------------------------------------

alter table public.profiles
  -- True when an admin created the account with a temporary password, or reset
  -- one. `requireUser()` sends these users to /set-password before anything
  -- else, so a shared temporary password cannot become a permanent one.
  add column must_change_password boolean not null default false,
  add column invited_by uuid references public.profiles(id),
  add column invited_at timestamptz;

comment on column public.profiles.must_change_password is
  'Forces /set-password on the next authenticated page load. Cleared by the setPassword action.';

-- ---------------------------------------------------------------------------
-- Privileged column guard, extended
-- ---------------------------------------------------------------------------
-- Replaces the version from 0002. Three additions:
--   * must_change_password cannot be cleared by the user it applies to,
--     otherwise the forced password change is one API call away from skipped.
--   * invited_by and invited_at are write-once provenance.
--   * an admin cannot suspend themselves, which is the other easy way to lock
--     the workspace out of its own user management.

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

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- last_seen_at
-- ---------------------------------------------------------------------------
-- Written by the app on a five-minute throttle, so the users table can show who
-- is actually still around. security definer because it is the one profile
-- write a suspended-then-reactivated user makes before anything else loads,
-- and because it must not trip the guard above.

create or replace function public.touch_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set last_seen_at = now()
   where id = auth.uid()
     and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
end;
$$;

revoke execute on function public.touch_last_seen() from public;
grant execute on function public.touch_last_seen() to authenticated;

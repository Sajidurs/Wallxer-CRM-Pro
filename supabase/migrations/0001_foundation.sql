-- 0001_foundation.sql
-- Phase 0. Workspaces, brands, profiles, and the two triggers everything else
-- depends on. See SYSTEM_DESIGN.md section 5.1.
--
-- Forward only. Once this file has been applied to any environment, never edit
-- it; write a new migration instead.

-- ---------------------------------------------------------------------------
-- Shared trigger function: updated_at
-- ---------------------------------------------------------------------------
-- Maintained by the database, not by application code, so a write that bypasses
-- the app (a fix in the SQL editor, a future import script) still leaves an
-- honest timestamp.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'Sets updated_at to now() on every UPDATE. Attach to every table that has the column.';

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
-- Exactly one row today. The column exists on every other table anyway, so
-- multi-tenancy later is a policy change rather than a rewrite.

create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- brands
-- ---------------------------------------------------------------------------
-- A tag on records, never a wall between them. The whole team works across all
-- brands, so brand filters the view; it does not partition the data.

create table public.brands (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  color         text not null default '#64748b',
  is_active     boolean not null default true,
  position      int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index brands_workspace_name_key
  on public.brands (workspace_id, lower(name));

create index brands_workspace_idx on public.brands (workspace_id);

create trigger brands_set_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('super_admin', 'admin', 'manager', 'member');
create type public.user_status as enum ('active', 'invited', 'suspended');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Mirrors auth.users. Populated by the trigger below, never by the app.
-- Users are never hard deleted; suspend instead, so their authored records keep
-- valid foreign keys.

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id),
  full_name     text not null,
  email         text not null,
  avatar_url    text,
  phone         text,
  job_title     text,
  role          public.user_role not null default 'member',
  status        public.user_status not null default 'invited',
  timezone      text not null default 'Asia/Dhaka',
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index profiles_workspace_idx on public.profiles (workspace_id);
create unique index profiles_workspace_email_key
  on public.profiles (workspace_id, lower(email));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- auth.users -> profiles
-- ---------------------------------------------------------------------------
-- Runs when a super admin invites someone. The invite carries full_name and
-- role in user metadata; both fall back to something sane if it does not.
--
-- ORDER MATTERS: a workspace row must exist before the first user is created.
-- seed.sql creates it. The exception below makes that failure legible instead
-- of surfacing as a not-null violation inside Supabase Auth.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  v_workspace_id := nullif(new.raw_user_meta_data ->> 'workspace_id', '')::uuid;

  if v_workspace_id is null then
    select id into v_workspace_id
    from public.workspaces
    order by created_at
    limit 1;
  end if;

  if v_workspace_id is null then
    raise exception
      'Cannot create a profile: no workspace exists. Run supabase/seed.sql before inviting users.';
  end if;

  insert into public.profiles (id, workspace_id, full_name, email, role, status)
  values (
    new.id,
    v_workspace_id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(new.email, 'user@unknown'), '@', 1)
    ),
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'role', '')::public.user_role, 'member'),
    case
      when new.email_confirmed_at is not null then 'active'::public.user_status
      else 'invited'::public.user_status
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accepting an invite confirms the email. That is the moment the account stops
-- being 'invited' and starts being 'active'. Without this, an invited user
-- would authenticate successfully and then be denied by every RLS policy,
-- because auth_workspace_id() only answers for active profiles.

create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.profiles
       set status = 'active'
     where id = new.id
       and status = 'invited';
  end if;

  -- Keep the mirrored email honest if it is changed in Supabase Auth.
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles set email = new.email where id = new.id;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after update on auth.users
  for each row execute function public.handle_user_confirmed();

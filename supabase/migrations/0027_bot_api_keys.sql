-- 0027_bot_api_keys.sql
-- API keys for the MCP endpoint (docs/mcp.md).
--
-- A key is a bearer token that acts as one profile. The raw token is shown
-- once, when an admin creates it, and only its SHA-256 hash is stored. Scopes
-- (read, write, finance) are enforced in the app; workspace, role, and
-- finance_access stay enforced by RLS because the request then runs as that
-- profile rather than as the service role.
--
-- Writes from those tools are recorded in mcp_audit_log. activity_log is the
-- wrong place: it is trigger-written, not insertable, and its entity_type
-- check does not cover invoices, proposals, renewals, or finance.
--
-- Forward only. Never edit once applied. This file is not applied by the
-- change that adds it.

-- ---------------------------------------------------------------------------
-- bot_api_keys
-- ---------------------------------------------------------------------------

create table public.bot_api_keys (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  -- First 12 characters of the token, so an admin can tell keys apart.
  -- Not a secret and not enough to authenticate.
  key_prefix   text not null,
  -- Hex SHA-256 of the full bearer token. Unique, so lookup is one index read.
  secret_hash  text not null,
  scopes       text[] not null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz,

  constraint bot_api_keys_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint bot_api_keys_prefix_shape check (key_prefix ~ '^wxm_[A-Za-z0-9_-]{4,12}$'),
  constraint bot_api_keys_hash_shape check (secret_hash ~ '^[0-9a-f]{64}$'),
  constraint bot_api_keys_scopes_known check (
    cardinality(scopes) >= 1
    and scopes <@ array['read', 'write', 'finance']::text[]
    and cardinality(scopes) = cardinality(array(select distinct unnest(scopes)))
  )
);

comment on table public.bot_api_keys is
  'Bearer keys for /api/mcp. secret_hash is SHA-256; the raw key is never stored.';

comment on column public.bot_api_keys.profile_id is
  'The CRM user the key acts as. RLS and finance_access are that profile''s.';

create unique index bot_api_keys_secret_hash_key on public.bot_api_keys (secret_hash);
create index bot_api_keys_workspace_idx on public.bot_api_keys (workspace_id);
create index bot_api_keys_profile_idx on public.bot_api_keys (profile_id);
create index bot_api_keys_created_by_idx on public.bot_api_keys (created_by);

-- ---------------------------------------------------------------------------
-- mcp_audit_log
-- ---------------------------------------------------------------------------
-- One row per write tool call, including refusals and validation failures.
-- Readable by admins, insertable only by the service role (no insert policy).

create table public.mcp_audit_log (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  api_key_id   uuid references public.bot_api_keys(id) on delete set null,
  profile_id   uuid references public.profiles(id) on delete set null,
  tool         text not null,
  entity_type  text,
  entity_id    uuid,
  ok           boolean not null,
  error        text,
  created_at   timestamptz not null default now(),

  constraint mcp_audit_log_tool_length check (char_length(tool) between 1 and 80),
  constraint mcp_audit_log_error_length check (error is null or char_length(error) <= 300)
);

comment on table public.mcp_audit_log is
  'Write calls made through /api/mcp. Stores the key id and the outcome, never the raw key or the arguments.';

create index mcp_audit_log_workspace_idx on public.mcp_audit_log (workspace_id, created_at desc);
create index mcp_audit_log_key_idx on public.mcp_audit_log (api_key_id, created_at desc);
create index mcp_audit_log_profile_idx on public.mcp_audit_log (profile_id);
create index mcp_audit_log_entity_idx on public.mcp_audit_log (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Admins of the workspace manage keys. secret_hash is not selectable: column
-- privileges omit it, so a stolen admin session cannot read the hashes either.
-- Revoke is one-way. The update policy's USING clause stops matching a row
-- once revoked_at is set, so it cannot be cleared.

alter table public.bot_api_keys enable row level security;
alter table public.bot_api_keys force row level security;

alter table public.mcp_audit_log enable row level security;
alter table public.mcp_audit_log force row level security;

create policy "bot_api_keys_select" on public.bot_api_keys
  for select to authenticated
  using (
    workspace_id = (select public.auth_workspace_id())
    and (select public.is_admin())
  );

create policy "bot_api_keys_insert" on public.bot_api_keys
  for insert to authenticated
  with check (
    workspace_id = (select public.auth_workspace_id())
    and (select public.is_admin())
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.profiles as linked
      where linked.id = profile_id
        and linked.workspace_id = workspace_id
        and linked.status = 'active'
    )
  );

create policy "bot_api_keys_update" on public.bot_api_keys
  for update to authenticated
  using (
    workspace_id = (select public.auth_workspace_id())
    and (select public.is_admin())
    and revoked_at is null
  )
  with check (
    workspace_id = (select public.auth_workspace_id())
    and (select public.is_admin())
    and revoked_at is not null
  );

create policy "mcp_audit_log_select" on public.mcp_audit_log
  for select to authenticated
  using (
    workspace_id = (select public.auth_workspace_id())
    and (select public.is_admin())
  );

revoke all on public.bot_api_keys from anon, authenticated;
revoke all on public.mcp_audit_log from anon, authenticated;

grant select (
  id,
  workspace_id,
  profile_id,
  name,
  key_prefix,
  scopes,
  created_by,
  created_at,
  last_used_at,
  revoked_at
) on public.bot_api_keys to authenticated;

grant insert (
  workspace_id,
  profile_id,
  name,
  key_prefix,
  secret_hash,
  scopes,
  created_by
) on public.bot_api_keys to authenticated;

grant update (revoked_at) on public.bot_api_keys to authenticated;

grant select on public.mcp_audit_log to authenticated;

-- The service role bypasses RLS. These grants cover a role that does not.
grant select, insert, update on public.bot_api_keys to service_role;
grant select, insert on public.mcp_audit_log to service_role;

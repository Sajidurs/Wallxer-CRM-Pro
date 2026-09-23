# Agency CRM — System Design

**Version:** 1.0
**Status:** Design approved, not yet built
**Owner:** Sajid
**Companion file:** `CHANGELOG.md` (must be updated on every change)

---

## 0. How to use this document

This file is the single source of truth for the CRM. Any human or AI agent working on this
codebase must read this file **and** `CHANGELOG.md` before writing a single line of code.

### Rules for AI agents working on this project

1. **Read first.** Open `SYSTEM_DESIGN.md`, then `CHANGELOG.md`. The changelog tells you what
   already exists, what changed last, and what is next.
2. **Never guess the schema.** The schema in Section 5 is authoritative. If the code and this
   file disagree, this file wins unless the changelog records a deliberate change.
3. **Update the changelog at the end of every work session.** No exceptions. An entry that is
   not in the changelog did not happen.
4. **If you change the design**, update this file _and_ record the decision in the Decision Log
   section of the changelog, with the reason.
5. **Follow the module pattern** in Section 6. New features go in their own folder. Do not
   scatter logic across the app.
6. **Never break these invariants:** every table has `workspace_id`, every table has RLS enabled,
   secrets are never sent to a client component, and nothing is hard deleted.

---

## 1. Goal and scope

An internal CRM that runs the entire operation across all brands in one place: contacts,
sales pipeline, client projects with credentials and files, team task management, and a
dashboard on top.

**Confirmed decisions:**

| Question    | Decision                                                          |
| ----------- | ----------------------------------------------------------------- |
| Who uses it | Internal team only, 6 to 15 people. No client login.              |
| Brand scope | All brands in one shared workspace, with a brand tag on records.  |
| Credentials | Encrypted at rest. Whole team can reveal. Every reveal is logged. |
| Files       | Documents, images, contracts. No full site backups or large zips. |
| Deal value  | Not tracked in v1. Columns exist and stay hidden until needed.    |
| Budget      | Under $10 per month. Free tiers cover v1.                         |

**In scope for v1:** Dashboard, Contacts, Pipeline, Projects, Tasks, Users.
**Deliberately deferred:** Finance, invoices, reports, email sync, automations, client portal.
Section 11 explains how each of those slots in without a rewrite.

---

## 2. Technology stack

| Layer        | Choice                             | Why                                                                                                         |
| ------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Framework    | Next.js 16, App Router, TypeScript | Server components cut client bundle size, server actions remove the need for a separate API layer early on. |
| Database     | Supabase Postgres                  | Relational data with real foreign keys, plus RLS enforced at the database, not in app code.                 |
| Auth         | Supabase Auth, email and password  | Invite only. Public signup disabled.                                                                        |
| Storage      | Supabase Storage, private buckets  | Fits the document and image workload.                                                                       |
| Styling      | Tailwind CSS v4                    | Fast, no design system lock in.                                                                             |
| Components   | shadcn/ui                          | You own the code, so components can be customised without fighting a library.                               |
| Server state | TanStack Query                     | Caching, optimistic updates, retries.                                                                       |
| Forms        | React Hook Form + Zod              | One Zod schema validates on client and server.                                                              |
| Tables       | TanStack Table                     | Sorting, filtering, pagination for large contact lists.                                                     |
| Dates        | date-fns                           | Small and tree shakeable.                                                                                   |
| Hosting      | Vercel Hobby                       | Free, zero config with Next.js.                                                                             |
| Errors       | Sentry free tier                   | Add in Phase 7.                                                                                             |

**Deliberately not used in v1:** a separate backend service, an ORM such as Prisma (the generated
Supabase types are enough and RLS is the security boundary), Redis, a queue, or a monorepo.
Each of these has an entry point described in Section 11 when the time comes.

### Next 16 notes

Three things differ from Next 15 and will bite anyone working from older examples:

- **`middleware.ts` is now `proxy.ts`**, lives at `src/proxy.ts`, and the exported function must be
  named `proxy`. It always runs on the Node runtime; the edge runtime is not available there.
- **Request APIs are async only.** `cookies()`, `headers()`, `params`, and `searchParams` are all
  Promises. Synchronous access was removed, not deprecated.
- **Typed route props.** `LayoutProps<'/'>` and `PageProps<'/path'>` are generated globals. Run
  `npx next typegen` if they go stale.

Next ships its own agent guidance in `node_modules/next/dist/docs/`, re-exported into `AGENTS.md`.
Read the relevant guide there before writing framework code; it is version-accurate in a way that
training data is not.

**shadcn/ui:** the registry no longer ships a `form` component. The current pattern is `field`
(`src/components/ui/field.tsx`) composed with React Hook Form directly. `FieldError` accepts RHF's
error objects as its `errors` prop.

---

## 3. Architecture overview

```
Browser
  |
  |  (RSC payloads + server actions)
  v
Next.js on Vercel
  |-- Server Components  ....  read data with the user scoped Supabase client
  |-- Server Actions     ....  all writes, Zod validated
  |-- Route Handlers     ....  file upload signing, webhooks, future public API
  |-- Admin client       ....  service role key, server only, user invites only
  |
  v
Supabase
  |-- Postgres + Row Level Security   (the real security boundary)
  |-- Auth                            (sessions, invites)
  |-- Storage                         (private buckets, RLS policies)
  |-- Vault / pgsodium                (credential encryption)
  |-- Realtime                        (off in v1, ready in Phase 7)
```

### Three non negotiable architectural rules

**1. The database is the security boundary, not the UI.**
Every table has RLS on. If someone bypassed the entire frontend and hit the API with a valid
user token, they still could not read another workspace or escalate their own role.

**2. Everything is workspace scoped from day one.**
There is exactly one workspace row today. Every table still carries `workspace_id`. This costs
nothing now and means turning the CRM into a multi tenant product later, or splitting brands
into separate workspaces, is a policy change instead of a rewrite.

**3. Shared subsystems are polymorphic.**
Attachments, comments, links, and the activity log are not per module. They attach to any entity
through `(entity_type, entity_id)`. When you add Invoices in six months, invoices get file
uploads, comments, and history for free.

---

## 4. Roles and permissions

Four roles, stored as an enum on `profiles`.

| Role          | Can do                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------ |
| `super_admin` | Everything, including creating and deleting users and changing roles.                      |
| `admin`       | Everything except deleting the last super admin and changing billing settings.             |
| `manager`     | Full CRUD on contacts, pipeline, projects, tasks. Cannot manage users.                     |
| `member`      | Read everything, create and edit records, edit only tasks assigned to them, cannot delete. |

**Reveal permission on credentials is separate from role.** Per your decision, every active
role can reveal a credential, and every reveal writes a row to `credential_access_log`.

Permission checks live in exactly two places and must be kept in sync:
`lib/permissions.ts` for UI affordances, and RLS policies for actual enforcement.

**Upgrade path:** when four roles stop being enough, add a `role_permissions` table
(`role`, `resource`, `action`) and change `lib/permissions.ts` to read from it. No table
outside that one needs to change, because policies already call helper functions rather
than comparing role strings inline.

---

## 5. Data model

All tables share this base: `id uuid primary key default gen_random_uuid()`,
`workspace_id uuid not null`, `created_at timestamptz default now()`,
`updated_at timestamptz default now()`, `created_by uuid references profiles(id)`,
and where noted `deleted_at timestamptz` for soft deletes.

`updated_at` is maintained by a shared trigger, not by application code.

### 5.1 Foundation

```sql
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Brands: Boost, Falah Chat, Aim Locksmith, Wallxer, Elever Notes.
-- One shared workspace, records tagged by brand. Filter, never isolate.
create table brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  color text default '#64748b',
  is_active boolean default true,
  created_at timestamptz default now()
);

create type user_role as enum ('super_admin','admin','manager','member');
create type user_status as enum ('active','invited','suspended');

-- Mirrors auth.users. Populated by a trigger on signup.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id),
  full_name text not null,
  email text not null,
  avatar_url text,
  phone text,
  job_title text,
  role user_role not null default 'member',
  status user_status not null default 'invited',
  timezone text default 'Asia/Dhaka',
  last_seen_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 5.2 Contacts

```sql
create type contact_type as enum ('person','company');

create table contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  brand_id uuid references brands(id),
  type contact_type not null default 'person',
  first_name text,
  last_name text,
  company_name text,
  job_title text,
  email text,
  phone text,
  whatsapp text,
  website text,
  address jsonb default '{}'::jsonb,    -- street, city, state, country, postal
  source text,                          -- referral, cold email, website
  status text default 'active',         -- active, lead, inactive, archived
  tags text[] default '{}',
  parent_contact_id uuid references contacts(id),  -- person belongs to company
  owner_id uuid references profiles(id),
  notes text,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references profiles(id),
  deleted_at timestamptz
);

create index on contacts (workspace_id) where deleted_at is null;
create index on contacts (brand_id);
create index on contacts (owner_id);
create index on contacts using gin (tags);
-- Full text search across name, company, email
create index contacts_search_idx on contacts using gin (
  to_tsvector('simple',
    coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' ||
    coalesce(company_name,'') || ' ' || coalesce(email,''))
);
```

`custom_fields` is the pressure valve. When you need "client since" or "monthly retainer"
on contacts and do not want a migration, it goes there. Once a field proves permanent,
promote it to a real column.

### 5.3 Pipeline

Stages are data, not code. You can rename, reorder, add, and archive stages without a deploy.

```sql
create table pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  brand_id uuid references brands(id),
  name text not null,
  is_default boolean default false,
  position int not null default 0,
  created_at timestamptz default now()
);

create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  name text not null,
  position int not null,
  color text default '#64748b',
  is_won boolean default false,
  is_lost boolean default false
);

create type deal_status as enum ('open','won','lost');

create table deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  pipeline_id uuid not null references pipelines(id),
  stage_id uuid not null references pipeline_stages(id),
  contact_id uuid references contacts(id),
  brand_id uuid references brands(id),
  title text not null,
  description text,
  status deal_status not null default 'open',
  owner_id uuid references profiles(id),
  position numeric not null default 1000,   -- fractional ordering for drag and drop
  expected_close_date date,
  -- Hidden in v1 UI. Present so money tracking is a UI change, not a migration.
  amount numeric(14,2),
  currency text default 'USD',
  custom_fields jsonb not null default '{}'::jsonb,
  closed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references profiles(id),
  deleted_at timestamptz
);

-- Written by a trigger on stage_id change. Powers velocity and conversion reports later.
create table deal_stage_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  deal_id uuid not null references deals(id) on delete cascade,
  from_stage_id uuid references pipeline_stages(id),
  to_stage_id uuid not null references pipeline_stages(id),
  changed_by uuid references profiles(id),
  changed_at timestamptz default now()
);
```

**On `position numeric`:** dragging a card between two others sets its position to the midpoint
of its neighbours. One row updates instead of renumbering the whole column. This matters once a
stage holds fifty deals.

### 5.4 Projects, websites, credentials

```sql
create type project_status as enum ('planning','active','on_hold','completed','cancelled');

create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  brand_id uuid references brands(id),
  contact_id uuid references contacts(id),   -- the client
  deal_id uuid references deals(id),         -- optional: which deal became this project
  name text not null,
  code text,                                  -- short human reference, e.g. PRJ-0042
  description text,
  status project_status not null default 'planning',
  start_date date,
  due_date date,
  owner_id uuid references profiles(id),
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references profiles(id),
  deleted_at timestamptz
);

-- A project can have several URLs: live, staging, dev, admin panel.
create table project_websites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  label text not null,
  url text not null,
  environment text default 'live',   -- live, staging, dev
  notes text,
  created_at timestamptz default now()
);

create type credential_category as enum
  ('hosting','domain','cms','ftp','database','email','analytics','social','other');

create table credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  project_id uuid references projects(id) on delete cascade,
  contact_id uuid references contacts(id),
  label text not null,                 -- "cPanel - main hosting"
  category credential_category not null default 'other',
  url text,
  username text,                       -- not secret, stored plainly
  secret_encrypted bytea not null,     -- password, encrypted
  notes_encrypted bytea,               -- recovery codes, API keys
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references profiles(id),
  deleted_at timestamptz
);

-- Every reveal is recorded. This is what makes shared access safe.
create table credential_access_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  credential_id uuid not null references credentials(id) on delete cascade,
  user_id uuid not null references profiles(id),
  action text not null,                -- reveal, create, update, delete
  ip inet,
  created_at timestamptz default now()
);
```

### 5.5 Tasks

```sql
create type task_status as enum ('todo','in_progress','review','blocked','done');
create type task_priority as enum ('low','medium','high','urgent');

create table tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  project_id uuid references projects(id) on delete cascade,
  contact_id uuid references contacts(id),
  parent_task_id uuid references tasks(id),   -- subtasks, ready but unused in v1
  title text not null,
  description text,
  status task_status not null default 'todo',
  priority task_priority not null default 'medium',
  start_at timestamptz,
  due_at timestamptz,
  estimated_minutes int,
  actual_minutes int,                          -- time tracking hook, unused in v1
  completed_at timestamptz,
  position numeric not null default 1000,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references profiles(id),
  deleted_at timestamptz
);

-- Junction table even though v1 assigns one person. Going from one to many
-- later is then a UI change instead of a data migration.
create table task_assignees (
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  workspace_id uuid not null,
  assigned_at timestamptz default now(),
  primary key (task_id, user_id)
);

create index on tasks (workspace_id, status) where deleted_at is null;
create index on tasks (project_id);
create index on tasks (due_at);
```

### 5.6 Shared subsystems

These four tables are the reason new modules are cheap to add.

```sql
-- Named URLs: recorded videos (Loom), Google Docs, Figma, spec sheets.
-- Attaches to tasks, projects, contacts, deals, and anything added later.
create type link_kind as enum ('video','document','design','repository','reference');

create table resource_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  entity_type text not null,     -- 'task' | 'project' | 'contact' | 'deal'
  entity_id uuid not null,
  kind link_kind not null default 'reference',
  name text not null,
  url text not null,
  position int default 0,
  created_at timestamptz default now(),
  created_by uuid references profiles(id)
);
create index on resource_links (entity_type, entity_id);

-- Real uploaded files in Supabase Storage.
create table attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  entity_type text not null,
  entity_id uuid not null,
  bucket text not null default 'project-files',
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz default now(),
  created_by uuid references profiles(id),
  deleted_at timestamptz
);
create index on attachments (entity_type, entity_id);

create table comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  entity_type text not null,
  entity_id uuid not null,
  parent_id uuid references comments(id),
  author_id uuid not null references profiles(id),
  body text not null,
  mentions uuid[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

-- Written by triggers. Powers the dashboard activity feed and future audit needs.
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  actor_id uuid references profiles(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,           -- created, updated, deleted, status_changed
  changes jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index on activity_log (workspace_id, created_at desc);
create index on activity_log (entity_type, entity_id);
```

### 5.7 Entity type registry

`entity_type` is a plain text column rather than an enum, on purpose. Adding an Invoices module
later must not require altering a type that four tables depend on. The allowed values are
validated in TypeScript in `lib/entities.ts`:

```ts
export const ENTITY_TYPES = [
  "contact",
  "deal",
  "project",
  "task",
  "credential",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
```

Add `'invoice'` to that array and the shared subsystems accept invoices immediately.

---

## 6. Application structure

The folder layout is the main defence against the app turning into spaghetti at module ten.

```
src/
  app/
    (auth)/
      login/page.tsx
      set-password/page.tsx
    (app)/
      layout.tsx                 sidebar, header, workspace context
      dashboard/page.tsx
      contacts/page.tsx
      contacts/[id]/page.tsx
      pipeline/page.tsx
      projects/page.tsx
      projects/[id]/page.tsx
      tasks/page.tsx
      settings/
        users/page.tsx
        brands/page.tsx
        pipelines/page.tsx
    api/
      upload/route.ts
  features/
    contacts/
      components/         ContactTable, ContactForm, ContactDetail
      actions.ts          server actions: create, update, delete
      queries.ts          data reads used by server components
      schema.ts           Zod schemas, shared by form and action
      types.ts
    pipeline/
    projects/
    credentials/
    tasks/
    users/
    dashboard/
    shared/
      attachments/        used by every module
      comments/
      resource-links/
      activity/
  components/
    ui/                   shadcn primitives
    layout/               Sidebar, Topbar, PageHeader
    common/               DataTable, EmptyState, ConfirmDialog, BrandBadge
  lib/
    supabase/
      client.ts           browser client
      server.ts           server component client
      admin.ts            service role, SERVER ONLY, invites only
    auth.ts               getCurrentUser, requireUser, requireRole
    permissions.ts        can(user, action, resource)
    entities.ts
    action-result.ts      the { ok, data } | { ok, error } contract
    env.ts                validated environment access
    crypto.ts             credential encrypt and decrypt wrappers
    utils.ts
  types/
    database.types.ts     generated: supabase gen types typescript
  proxy.ts                session refresh and the logged-out gate (Next 16)
scripts/
  bootstrap-admin.mjs     creates the first super admin
  verify-rls.mjs          asserts the policies actually hold
supabase/
  migrations/             numbered SQL files, never edited after being applied
  seed.sql
SYSTEM_DESIGN.md
CHANGELOG.md
```

`src/proxy.ts` sits beside `app/`, not inside it. It is a convenience redirect, not the security
boundary — RLS is. Treat a change there as a UX change, never as an authorisation change.

### The module contract

Every feature folder exposes the same four files: `schema.ts`, `queries.ts`, `actions.ts`,
`components/`. Nothing outside a feature folder imports from another feature's internals.
If Contacts needs something from Projects, it goes through `projects/queries.ts`.

Adding a module means: one migration, one feature folder, one route, one sidebar entry.
That is the whole checklist.

### Data flow

Reads: server component calls `features/x/queries.ts` with the user scoped Supabase client.
No loading spinner, no client fetch, data arrives with the HTML.

Writes: client form, validated by Zod through React Hook Form, submits to a server action in
`features/x/actions.ts`. The action re-validates with the same Zod schema (never trust the
client), performs the write, calls `revalidatePath`, and returns a typed result.

Interactive lists such as the pipeline board use TanStack Query on top of the same server
actions, so a drag can update optimistically and roll back on failure.

---

## 7. Security

### 7.1 Authentication

Supabase Auth with email and password. **Public signup is disabled in the Supabase dashboard.**
Users are created only by a super admin through a server action that uses the service role client
to call `auth.admin.inviteUserByEmail`. A trigger on `auth.users` inserts the matching `profiles`
row with status `invited`.

The service role key lives in `SUPABASE_SERVICE_ROLE_KEY`, is never prefixed `NEXT_PUBLIC_`, and
is imported only by `lib/supabase/admin.ts`. Add a lint rule forbidding that import outside
server actions.

### 7.2 Row Level Security

RLS is enabled on every table. Policies call helper functions so that a future permission change
touches one function instead of forty policies.

```sql
-- Note the `status = 'active'` clause. The original design omitted it here,
-- which left a suspended user with a valid workspace id and therefore read
-- access to everything. Suspension has to deny at this function or it does not
-- deny at all.
create or replace function auth_workspace_id() returns uuid
language sql stable security definer set search_path = public as $$
  select workspace_id from profiles where id = auth.uid() and status = 'active'
$$;

create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and status = 'active'
$$;

create or replace function is_admin() returns boolean
language sql stable as $$
  select auth_role() in ('super_admin','admin')
$$;

-- Standard pattern, repeated for each table
alter table contacts enable row level security;

create policy "read own workspace" on contacts for select
  using (workspace_id = auth_workspace_id() and deleted_at is null);

create policy "insert own workspace" on contacts for insert
  with check (workspace_id = auth_workspace_id());

create policy "update own workspace" on contacts for update
  using (workspace_id = auth_workspace_id());

create policy "delete admins only" on contacts for delete
  using (workspace_id = auth_workspace_id() and is_admin());
```

Users management is stricter: a user may read all profiles in the workspace, update only their
own profile, and only a super admin may change the `role` column. That last rule is enforced by
a trigger, because an update policy cannot easily restrict a single column.

### 7.3 Credential encryption

Passwords are encrypted at rest using `pgsodium` with a key held in Supabase Vault. Plaintext
never sits in a column and never appears in a database backup in readable form.

Access goes through two `security definer` functions:

```sql
-- Writes an encrypted credential
create or replace function create_credential(
  p_project_id uuid, p_label text, p_category credential_category,
  p_url text, p_username text, p_secret text, p_notes text
) returns uuid ...

-- Reveals one credential and logs who did it
create or replace function reveal_credential(p_credential_id uuid)
returns table (username text, secret text, notes text) ...
```

`reveal_credential` inserts a `credential_access_log` row before returning. Because the whole
team can reveal, the log is the accountability mechanism. Surface it in the UI as
"Last viewed by Rahim, 2 hours ago" directly on the credential card.

**Frontend rules, non negotiable:**

- The secret is never included in a list query. Lists show label, category, username only.
- Reveal is an explicit click that calls a server action, which calls the RPC.
- The revealed value lives in component state, is copied to clipboard, and clears after 30 seconds.
- Never log a decrypted secret, never put it in a URL, never render it in a server component
  that streams to the page.

**Fallback if pgsodium becomes awkward:** application layer AES-256-GCM in `lib/crypto.ts` with a
32 byte key in `CREDENTIAL_ENCRYPTION_KEY`. Same function boundary, same logging, same UI. Record
the switch in the changelog Decision Log if you take it.

### 7.4 File storage

Two buckets, both private:

| Bucket          | Path convention                                              | Limits         |
| --------------- | ------------------------------------------------------------ | -------------- |
| `project-files` | `{workspace_id}/{entity_type}/{entity_id}/{uuid}-{filename}` | 25 MB per file |
| `avatars`       | `{workspace_id}/{user_id}.{ext}`                             | 2 MB per file  |

Uploads go through a route handler that checks permission, enforces the size and MIME allow list
(pdf, docx, xlsx, png, jpg, webp, zip under 25 MB), writes the file, then inserts the
`attachments` row. Downloads use short lived signed URLs, 60 seconds, generated on demand.
No public URLs anywhere.

Storage RLS policies mirror the table policies, matching on the first path segment being the
user's workspace id.

---

## 8. Module specifications

### 8.1 Dashboard

Not a separate data source. It reads the same tables through Postgres views so the numbers can
never drift from the modules.

Widgets in v1:

- Counters: active projects, open deals, contacts, tasks due today, tasks overdue.
- My tasks: assigned to the logged in user, sorted by due date.
- Pipeline summary: count of deals per stage, as a simple bar.
- Recent activity: last 20 rows of `activity_log`, joined to actor names.
- Projects at risk: status `active` with a `due_date` in the past.

Widget rendering is driven by a config array so adding a widget is one entry plus one component.
When counts get slow, replace the view with a materialised view refreshed every 5 minutes. No
application code changes.

### 8.2 Contacts

List with server side pagination, full text search, and filters on brand, type, owner, tags.
Detail page with tabs: Overview, Deals, Projects, Tasks, Files, Comments, Activity. Person
contacts can link to a company contact through `parent_contact_id`.

CSV import lands in Phase 7 and matters, given your existing contact lists. Design the import to
write through the same Zod schema and server action as the manual form, so validation cannot
diverge.

### 8.3 Pipeline

Kanban board, columns from `pipeline_stages`, drag and drop with optimistic updates. A deal is
created by picking an existing contact, per your requirement. Multiple pipelines are supported
from day one because different brands sell differently.

Value fields exist in the schema and are hidden behind a workspace setting,
`settings.pipeline.show_values`. Turning money tracking on later is a toggle, not a migration.

### 8.4 Projects

Detail page tabs: Overview, Websites, Credentials, Files, Tasks, Comments, Activity. Linked to
one client contact. Websites and credentials are their own child tables so a project can hold
several of each, which real client work always ends up needing.

### 8.5 Tasks

Views: list grouped by status, board, and calendar by `due_at`. Filters by assignee, project,
brand, priority, and due window.

The task form holds: title, description, assignee, project, status, priority, start and due
time, estimated minutes, plus a repeatable links section. Each link row is name, URL, and kind,
where kind `video` covers the recorded walkthrough and kind `document` covers the named document
links. The section has an "add another" control with no fixed limit, backed by `resource_links`.

### 8.6 Users

Super admin and admin only. Invite by email, assign role and brand access, suspend, and reset
password. Suspending sets status to `suspended`, which `auth_role()` returns null for, so every
policy denies that user instantly without deleting their history.

Users are never hard deleted. Their created records keep valid foreign keys.

---

## 9. Build phases

Ship in this order. Each phase ends with working, deployed software.

| Phase | Contents                                                                                                          | Rough effort |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ------------ |
| 0     | Repo, Supabase project, auth, profiles trigger, workspace and brands seed, RLS helpers, app shell, sidebar, theme | 3 to 4 days  |
| 1     | Users management. Built early because everything else needs real accounts to test against.                        | 2 days       |
| 2     | Contacts, full CRUD, search, filters, detail tabs                                                                 | 3 to 4 days  |
| 3     | Projects, websites, credentials with encryption, file uploads                                                     | 4 to 5 days  |
| 4     | Tasks, resource links, board and list views                                                                       | 4 days       |
| 5     | Pipeline, stages admin, drag and drop board                                                                       | 3 days       |
| 6     | Dashboard views and widgets                                                                                       | 2 days       |
| 7     | Polish: global search, activity feed, CSV import, comments, Sentry, empty states                                  | 3 to 4 days  |

Phase 0 and 1 first is deliberate. Building contacts before auth means rebuilding contacts once
RLS arrives.

---

## 10. Cost and operations

| Service  | Tier  | Cost                 | Limit that bites first                                      |
| -------- | ----- | -------------------- | ----------------------------------------------------------- |
| Vercel   | Hobby | $0                   | 100 GB bandwidth per month. Far beyond 15 internal users.   |
| Supabase | Free  | $0                   | 500 MB database, 1 GB storage, 50,000 monthly active users. |
| Domain   |       | roughly $1 per month |                                                             |

Total: about $1 per month, inside your budget.

**Watch these two things:**

1. The Supabase free project pauses after 7 days with no activity. Daily team use prevents this.
   If you ever pause, a scheduled ping keeps it warm.
2. 1 GB of storage covers documents and contracts comfortably. If it fills, Supabase Pro at $25
   per month brings 8 GB, or move the `attachments` bucket to Cloudflare R2. The `attachments`
   table already has a `bucket` column so that move is a config change, not a schema change.

**Environments:** one Supabase project for production, plus `supabase start` locally for
development. A separate staging project is worth adding once more than one person writes code.

**Backups:** free tier backups are limited. Run a weekly `pg_dump` to local or Drive until Pro.
Set a calendar reminder. This is the one gap in the free tier that can actually hurt.

---

## 11. Future roadmap and where each piece plugs in

Nothing below needs a rewrite. Each maps to a known extension point.

| Future feature                  | Extension point                                                                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finance, income and expenses    | New `transactions` table, `brand_id` and `project_id` foreign keys, new feature folder.                                                                                 |
| Invoices and quotes             | `invoices` and `invoice_items` tables. Add `'invoice'` to `ENTITY_TYPES` and it inherits files, comments, and activity.                                                 |
| Deal values and revenue reports | Flip `settings.pipeline.show_values`. Columns already exist.                                                                                                            |
| Reports and analytics           | Postgres views, then materialised views. `deal_stage_history` and `activity_log` already collect the raw data.                                                          |
| Notifications                   | `notifications` table plus Supabase Realtime subscription. `comments.mentions` already stores who to notify.                                                            |
| Email integration               | Route handler webhook, `email_messages` table linked to `contact_id`.                                                                                                   |
| Time tracking                   | `tasks.actual_minutes` exists. Add a `time_entries` table for detail.                                                                                                   |
| Recurring tasks                 | `recurrence_rule` column on tasks plus a Supabase scheduled function.                                                                                                   |
| Automations                     | `automations` table storing trigger and action JSON, executed by database triggers or an Edge Function.                                                                 |
| Client portal                   | The hardest one, and the reason for workspace scoping. Add a `client_users` role reading a restricted view of projects and tasks. RLS is already the enforcement layer. |
| Multi tenant SaaS               | Remove the single workspace assumption, add workspace switching. Every table is already scoped.                                                                         |
| Public API                      | Route handlers under `app/api/v1/`, plus an `api_keys` table. Business logic already lives in `queries.ts` and `actions.ts`, not in components.                         |
| Mobile app                      | Same Supabase backend, Expo client. RLS means the mobile client needs no separate security layer.                                                                       |

### The three decisions that make all of this possible

1. **`workspace_id` everywhere**, even with one workspace.
2. **Polymorphic shared subsystems**, so new entities inherit files, links, comments, history.
3. **Business logic in `queries.ts` and `actions.ts`**, never inside components, so a second
   client such as a mobile app or public API reuses it.

---

## 12. Conventions

- **Naming:** tables plural snake_case, columns snake_case, TypeScript camelCase, components PascalCase.
- **Migrations:** numbered, forward only. Never edit an applied migration, write a new one.
- **Types:** regenerate `database.types.ts` after every migration. Committed to the repo.
- **Deletes:** soft delete by default. Every read filters `deleted_at is null`.
- **Timestamps:** always `timestamptz`, always stored UTC, formatted in the user's timezone at render.
- **Money:** `numeric(14,2)`, never float. Currency stored beside every amount.
- **Errors:** server actions return `{ ok: true, data }` or `{ ok: false, error }`. Never throw across the boundary.
- **Validation:** one Zod schema per entity in `schema.ts`, imported by both the form and the action.
- **Secrets:** anything prefixed `NEXT_PUBLIC_` is public. Treat it as printed on a billboard.

---

## 13. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only, never exposed
CREDENTIAL_ENCRYPTION_KEY=        # only if using the app layer fallback
NEXT_PUBLIC_APP_URL=
SENTRY_DSN=                       # Phase 7
```

---

## 14. Open items to decide later

These do not block the build. Record the answers in the changelog Decision Log when settled.

1. Should `member` role see all credentials, or only those on projects they are assigned to?
   Currently all, per your decision. Easy to tighten later.
2. Contact deduplication rule on CSV import: match on email, or email plus phone?
3. Task notification channel when notifications arrive: in app only, email, or WhatsApp.
4. Retention policy for `activity_log`. It grows forever. Consider archiving rows older than
   12 months once the table passes a million rows.

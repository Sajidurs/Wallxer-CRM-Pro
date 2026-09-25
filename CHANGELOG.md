# Changelog

Working memory for the Agency CRM. Read this **and** `SYSTEM_DESIGN.md` before starting any work.
Update this file at the end of every work session, before you stop.

---

## How to update this file

1. Read **Current State** to learn what exists right now.
2. Read **Next Up** to learn what to work on.
3. Do the work.
4. Before finishing:
   - Add an entry under **Unreleased** describing what you did.
   - Update **Current State** so it stays accurate.
   - Update **Next Up**.
   - If you made a design decision, add it to the **Decision Log** with the reason.
   - If you left something broken or half done, add it to **Known Issues**. Do not hide it.
5. If you changed the design itself, also edit `SYSTEM_DESIGN.md` in the same session.

**Entry format**

```
### YYYY-MM-DD — Short title
**Added / Changed / Fixed / Removed / Deprecated**
- What changed, in one line each.

**Files touched:** path/one.ts, path/two.tsx
**Migration:** supabase/migrations/0007_xxx.sql (or: none)
**Notes:** anything the next person must know.
```

**Categories:** Added, Changed, Fixed, Removed, Deprecated, Security.

**Rules**

- One entry per session, not per file.
- Write what changed and why, not a list of function names.
- Always record whether a migration was created. This is the single most common cause of a
  broken local environment.
- Never delete old entries. Move released ones into a version section.

---

## Current State

**Last updated:** 2026-09-25
**Phase:** 6 complete. Phases 0 through 6 done. Only Phase 7 (polish) remains.
**Deployed:** yes — https://wallxer-crm-pro.vercel.app
**Supabase project:** `wjtokyywsuummyaumyty`, free tier
**Repo:** https://github.com/Sajidurs/Wallxer-CRM-Pro, branch `main`

### What exists

- Next 16 app: App Router, TypeScript, Tailwind v4, shadcn/ui (radix / nova preset).
- Supabase clients for browser, server, and service role.
- `src/proxy.ts`: session refresh and the logged-out redirect.
- Login page, protected `(app)` route group, app shell with sidebar, topbar, and user menu.
- Dashboard shell with placeholder counters. Stub pages for every unbuilt sidebar route.
- Users management: add, change role, suspend, reactivate, reset password, own profile.
- Contacts: list with search and filters, create, edit, soft delete with undo, detail page.
- Workspace `Agency` and all five brands seeded. Two real users: one super admin, one manager.

### Modules status

| Module                            | Status               | Notes                                    |
| --------------------------------- | -------------------- | ---------------------------------------- |
| Foundation (auth, workspace, RLS) | Done, deployed       | Complete                                 |
| Users management                  | Done, deployed       | Email-invite path untested, no SMTP      |
| Contacts                          | Done, deployed       | CSV import is still Phase 7              |
| Projects, credentials, files      | Done                 | Files attach to contacts too             |
| Tasks                             | Done                 | List and board; calendar view deferred   |
| Pipeline                          | Done                 | Deal values hidden until settings flip   |
| Dashboard                         | Done                 | Counts through views; activity feed live |
| Polish and search                 | Not started          | Phase 7                                  |

### Migrations applied

| Migration              | Applied to `wjtokyywsuummyaumyty` |
| ---------------------- | --------------------------------- |
| `0001_foundation.sql`  | Yes, 2026-09-24                   |
| `0002_rls_helpers.sql` | Yes, 2026-09-24                   |
| `0003_users_management.sql` | Yes, 2026-09-24              |
| `0004_contacts.sql`    | Yes, 2026-09-24                   |
| `0005_projects.sql`    | Yes, 2026-09-24                   |
| `0006_credentials.sql` | Yes, 2026-09-24                   |
| `0007_credentials_search_path_fix.sql` | Yes, 2026-09-24  |
| `0008_attachments.sql` | Yes, 2026-09-24                   |
| `0009_fix_attachment_soft_delete.sql` | Yes, 2026-09-24 |
| `0010_attachment_authorship.sql` | Yes, 2026-09-24      |
| `0011_tasks.sql`       | Yes, 2026-09-25                   |
| `0012_resource_links.sql` | Yes, 2026-09-25                |
| `0013_pipeline.sql`    | Yes, 2026-09-25                   |
| `0014_activity_log.sql` | Yes, 2026-09-25                  |
| `0015_dashboard_views.sql` | Yes, 2026-09-25               |
| `0016_fix_activity_label.sql` | Yes, 2026-09-25            |
| `seed.sql`             | Yes, 2026-09-24                   |

### Environment variables in use

Set in `.env.local`, which is gitignored. `.env.example` lists them with no values.

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_APP_URL`, plus `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, and
`SUPABASE_ACCESS_TOKEN` for the CLI, and `SUPABASE_EMAIL_ENABLED`.

`CREDENTIAL_ENCRYPTION_KEY` is **unused and stays empty**. Credentials are encrypted inside the
database with a key held in Supabase Vault, not in application code, so that variable belongs to
the application-layer fallback that was not taken. `SENTRY_DSN` is Phase 7.

### Useful commands

| Command                    | Does                                                     |
| -------------------------- | -------------------------------------------------------- |
| `npm run db:push`          | Applies pending migrations to the linked project         |
| `npm run db:seed`          | Runs `seed.sql` against the linked project               |
| `npm run types:generate`   | Regenerates `src/types/database.types.ts`                |
| `npm run bootstrap:admin`  | Creates or promotes a super admin                        |
| `npm run verify:rls`       | Asserts the policies hold. Needs `CHECK_EMAIL` and `CHECK_PASSWORD` |
| `npm run verify:schemas`   | Asserts every Zod schema is idempotent. Run after touching one     |
| `curl <url>/api/health`    | Says which commit is actually deployed                             |

---

## Next Up

**Phase 7, Polish.** The last phase. Section 9 lists: global search, activity feed, CSV import,
comments, Sentry, empty states. The activity feed shipped with Phase 6, so what remains:

1. **CSV import for contacts** — the one that matters most, given the existing lists. Section 8.2:
   it must write through the same Zod schema and server action as the manual form, so validation
   cannot diverge. Decide the deduplication rule first — it is still open question 2 in section 14:
   match on email, or email plus phone?
2. **`comments`** from section 5.6, the fourth shared subsystem. Same polymorphic shape as
   `attachments` and `resource_links`, so follow those rather than inventing a third pattern.
   `comments.mentions` already exists for notifications later.
3. **Global search** across contacts, projects, tasks, and deals. Contacts already has a
   `search_vector`; the others would need one, or a shared search view.
4. **Sentry**, free tier, with `SENTRY_DSN`.
5. A trash view, so a soft-deleted record can be restored without the Undo toast or a hand-written
   query. Currently a Known Issue for contacts.

**Before or alongside Phase 7, two operational gaps that are not features:**

- **Backups.** Section 10 calls this the one free-tier gap that can actually hurt, and the database
  now holds real client data and encrypted credentials. A weekly `pg_dump` to Drive closes it.
- **Custom SMTP**, so email invites and password resets work at all.

**Definition of done for Phase 7:** an existing contact list imports without duplicates, any record
can be commented on, and one search box finds anything.

---

## Unreleased

### 2026-09-25 — Phase 6, Dashboard

**Added**

- Migration `0014_activity_log.sql`: `activity_log`, the fourth and last shared subsystem from
  section 5.6, written by one generic trigger attached to contacts, projects, tasks, and deals.
  Adding it to a new module is a `create trigger` line.
- Migration `0015_dashboard_views.sql`: five views — counts, deals by stage, projects at risk,
  recent activity, my tasks.
- A real `/dashboard`: five counters that link to the filtered list behind them, a recent-activity
  feed, my tasks, a pipeline summary, and projects at risk. The placeholder counters that showed a
  dash and a phase number are gone.
- `features/dashboard/` with `widgets.ts`, a config array. Section 8.1: adding a widget is an entry
  plus a component, not an edit to the page's layout.

**Security**

- **Every view is `security_invoker = on`, and that is the whole security story of this phase.** A
  Postgres view runs as its *owner* by default, which bypasses the RLS of whoever queries it. A
  dashboard built on owner views would show one workspace's numbers to another's users and look
  entirely correct doing it. Verified: `anon` gets `permission denied`, and a member and an admin
  see identical counts.
- `activity_log` is readable by the workspace and writable by nobody — no INSERT, UPDATE, or DELETE
  policy at all. Verified: a member cannot forge a row and a super admin cannot erase one.

**Fixed**

- **`0016_fix_activity_label.sql`: the trigger in `0014` broke creating and editing every record it
  was attached to.** It chose a display label with a `CASE` over `tg_table_name` referencing
  `v_row.first_name`, `v_row.name`, and `v_row.title` in different branches. SQL `CASE` evaluates
  lazily but PL/pgSQL does not work that way: it rewrites the whole expression into a SQL query and
  resolves *every* record field reference as a parameter, whichever branch would run. A field the
  triggering table lacks therefore raises, always — so contacts failed on `name` and projects
  failed on `first_name`. Rewritten to ask the row as `to_jsonb(v_row) ->> 'field'`, which returns
  null for an absent key.

**Changed**

- `scripts/verify-rls.mjs`: 73 checks to 84.

**Files touched:** `supabase/migrations/001{4,5,6}_*.sql`, `src/features/dashboard/**`,
`src/app/(app)/dashboard/page.tsx`, `scripts/verify-rls.mjs`

**Migration:** `0014_activity_log.sql`, `0015_dashboard_views.sql`, `0016_fix_activity_label.sql`.
All applied to `wjtokyywsuummyaumyty`.

**Notes:**

- Verified: 84/84 RLS checks, 11/11 end-to-end. The end-to-end checks read the numbers **out of the
  rendered HTML** and compare them against a direct count of the tables, which is the only way to
  catch a dashboard that is confidently wrong.
- **The counts and the lists are the same question.** Each view applies the same `deleted_at is
  null` and status filters the module lists use, so they cannot drift. A count written by hand in
  the page would have drifted the first time a module changed its filters.
- The label in `changes` is denormalised, so a feed entry keeps the name the record had at the
  time rather than its current one. For a record of what happened, that is arguably more truthful.
- No chart library for the pipeline bars. Section 8.1 asks for "a simple bar" and these are div
  widths; a dependency for five of them would be weight without a job.

### 2026-09-25 — Phase 5, Pipeline

**Added**

- Migration `0013_pipeline.sql`: `pipelines`, `pipeline_stages`, `deals`, the `deal_status` enum,
  and `deal_stage_history`, plus four triggers.
- `features/pipeline/` per the module contract.
- `/pipeline`: a kanban board with drag and drop, columns from `pipeline_stages`, midpoint ordering
  so one row is written per drop. Multiple pipelines from day one, chosen through a picker whose
  state lives in the URL.
- `/pipeline/new`, `/pipeline/[id]`, `/pipeline/[id]/edit`. The detail page shows how the deal
  actually progressed, from the history table.
- `/settings/pipelines`, previously a stub: add, rename, recolour, reorder, and archive stages, and
  mark a stage as closing won or lost. No deploy needed, which is the point of stages being data.
- A default **Sales** pipeline with six stages, created by the migration. A board with no stages is
  not a board, and a first run should not depend on someone remembering to seed it.
- The Deals tab on contact detail, replacing the "Phase 5" placeholder.

**Security**

- `deal_stage_history` is written **only** by a trigger and has no INSERT, UPDATE or DELETE policy.
  Verified: a member cannot forge a history row, and a super admin cannot erase one. How a deal
  progressed is a record, not an opinion.
- Stage and pipeline administration is admin-only at the policy level, not just in the UI. Verified:
  a member renaming a stage leaves it unchanged.
- Deleting a deal is manager-only, and the SELECT policy carries the `or is_manager()` escape from
  `0009` so the soft delete does not reject its own result.

**Changed**

- `status` and `closed_at` on a deal are derived from its stage by a trigger, so dragging a card
  into Won is what wins the deal. The action deliberately does not send either field: two sources
  of truth for the same fact is how they come to disagree.
- Archiving a stage that still holds deals is refused with a count, rather than hiding those deals
  from the board with no route back to them.
- `scripts/verify-rls.mjs`: 61 checks to 73.

**Files touched:** `supabase/migrations/0013_pipeline.sql`, `src/features/pipeline/**`,
`src/app/(app)/pipeline/**`, `src/app/(app)/settings/pipelines/page.tsx`,
`src/app/(app)/contacts/[id]/page.tsx`, `src/components/layout/nav-config.ts`,
`scripts/verify-rls.mjs`

**Migration:** `0013_pipeline.sql`, applied to `wjtokyywsuummyaumyty`.

**Notes:**

- Verified: 73/73 RLS checks, 14/14 end-to-end over HTTP. The history checks assert that creating a
  deal records its first stage, that moving it writes **exactly one** row, and that editing it
  without moving it writes none.
- **Deal values stay hidden.** `amount` and `currency` exist on the table and are absent from every
  screen, including the form, while `settings.pipeline.show_values` is false. One helper decides,
  so nothing renders a number the workspace has chosen not to track. Turning it on is a settings
  change, not a migration — which was the reason the columns were specified in the first place.
- The insert is treated as a stage change too. A deal entering the pipeline is the start of its
  history, and omitting it would make every duration calculation begin from the wrong point.
- Reordering stages swaps two positions rather than renumbering the column, so a concurrent edit
  elsewhere in the list cannot be clobbered.
- `requireAdmin` needed an explicit return type. Without one TypeScript infers a union whose members
  each carry the other's key as optional, so `guard.error` widened to `string | undefined` even
  after narrowing on `"error" in guard`.

### 2026-09-25 — Phase 4, Tasks

**Added**

- Migration `0011_tasks.sql`: `tasks` and `task_assignees`, the `task_status` and `task_priority`
  enums, indexes including one for board ordering, RLS, and two triggers.
- Migration `0012_resource_links.sql`: the `resource_links` polymorphic subsystem, shaped
  deliberately like `attachments` rather than inventing a second pattern.
- `features/tasks/` and `features/shared/resource-links/` per the module contract.
- `/tasks` with a **list** and a **board** view, sharing one set of URL filters: search, due window
  (overdue, today, next 7 days, none), status, priority, assignee, project, plus a "My tasks"
  toggle.
- `/tasks/new`, `/tasks/[id]`, `/tasks/[id]/edit`.
- The repeatable links section from section 8.5: name, URL, and kind, with "add another" and no
  fixed limit. `kind: 'video'` carries the recorded walkthrough the design asks for.
- Drag and drop on the board, with optimistic movement and midpoint ordering so one row is written
  per drop rather than renumbering a column.
- Real Tasks tabs on project and contact detail, replacing the "Phase 4" placeholders.

**Security**

- **A member can now only edit tasks assigned to them, enforced by the database.** Until this,
  section 4's rule lived solely in `lib/permissions.ts`, which decides whether to render a button
  and stops nothing — a member could have PATCHed any task directly.
- Assignment is restricted in step with editing. A member who could assign themselves any task
  would have had a one-step route to editing everything, so `task_assignees` insert and delete are
  manager-only except on a task you created. Verified.
- Deleting a task is manager-only, including your own.

**Changed**

- `completed_at` is maintained by a database trigger, not the app, so it cannot drift from `status`.
  Phase 6's dashboard depends on it being true.
- `nav-config.ts`: Projects and Tasks no longer carry "phase" markers.
- `scripts/verify-rls.mjs`: 53 checks to 61. `scripts/verify-schemas.ts`: 12 schemas to 20.

**Fixed**

- `taskSchema.estimatedMinutes` rejected the field being absent entirely. In Zod 4 a union
  containing `z.undefined()` still requires the key to be present; `.optional()` on the union is
  what actually makes it optional. Caught by the idempotence check, before it reached the UI.
- `updateTask` ignored the links the form submits, so editing a task silently discarded link
  changes. Links are now replaced wholesale on save.

**Files touched:** `supabase/migrations/0011_tasks.sql`, `supabase/migrations/0012_resource_links.sql`,
`src/features/tasks/**`, `src/features/shared/resource-links/**`, `src/app/(app)/tasks/**`,
`src/app/(app)/projects/[id]/page.tsx`, `src/app/(app)/contacts/[id]/page.tsx`,
`src/components/layout/nav-config.ts`, `scripts/verify-rls.mjs`, `scripts/verify-schemas.ts`

**Migration:** `0011_tasks.sql`, `0012_resource_links.sql`. Both applied to `wjtokyywsuummyaumyty`.

**Notes:**

- Verified: 61/61 RLS checks, 20/20 schema idempotence, 20/20 end-to-end over HTTP.
- **The soft-delete rule from `0009` was applied at the point it would otherwise have repeated.**
  The tasks SELECT policy ends in `or is_manager()` because deletion is manager-only, so the row an
  UPDATE produces still satisfies the policy. Carry this to `deals` in Phase 5.
- **The calendar view from section 8.5 is not built.** List and board are; a month grid is a
  different component with its own navigation, and the due-window filters cover the question
  "what is coming up" that the calendar was mostly there to answer. Recorded as a Known Issue
  rather than quietly dropped.
- The board uses the HTML5 drag API rather than a drag-and-drop library. Five columns and one card
  at a time do not justify the dependency; reach for one when multi-select or nested sorting
  arrives.
- Sorting by priority happens in JavaScript after the page is fetched, because `task_priority` is
  an enum and Postgres orders enums by declaration, not by weight. That is correct within a page
  and wrong across pages — a `priority_weight` column would fix it properly if it ever matters.

### 2026-09-24 — Fix: deleting a file was impossible, and attachment authorship was forgeable

**Fixed**

- Removing a file failed with `new row violates row-level security policy for table "attachments"`,
  for every user. Reported from real use, not caught by the tests.

  **Root cause.** PostgreSQL requires the row an UPDATE *produces* to still satisfy the SELECT
  policy. The policy from `0008` was `workspace_id = auth_workspace_id() and deleted_at is null`, so
  the moment `deleted_at` was set the new row became invisible under its own SELECT policy and the
  write was rejected. Soft delete could never have worked.

  `contacts` and `projects` were unaffected because their SELECT policies end in `or is_manager()`,
  which keeps a deleted row visible to whoever is allowed to delete it. `0009` gives attachments the
  same escape, plus `created_by = auth.uid()`, because the guard deliberately lets people remove
  files they uploaded and that permission is worthless if the policy blocks the write.

- **Attachment authorship was forgeable.** The insert policy checked only `workspace_id`, so a
  client could set `created_by` to anyone — and "you may delete your own file" rests entirely on
  that column being truthful. `0010` constrains it on insert and makes it immutable afterwards.
  Found while fixing the first bug, not reported.

**Changed**

- `scripts/verify-rls.mjs`: 47 checks to 53. The new ones perform a soft delete and assert the row
  is actually marked deleted, rather than only checking who is refused one.

**Files touched:** `supabase/migrations/0009_fix_attachment_soft_delete.sql`,
`supabase/migrations/0010_attachment_authorship.sql`, `scripts/verify-rls.mjs`

**Migration:** `0009_fix_attachment_soft_delete.sql`, `0010_attachment_authorship.sql`. Both applied
to `wjtokyywsuummyaumyty`.

**Notes:**

- **The rule to carry forward:** on a soft-deletable table, whoever may set `deleted_at` must still
  satisfy the SELECT policy afterwards. A SELECT policy ending in a bare `deleted_at is null` makes
  soft delete impossible for everyone. Check this when adding `tasks` in Phase 4.
- **Why the tests missed it.** Every soft-delete check asserted who was *refused* — a member cannot
  delete a contact, a member cannot delete a project. Not one of them performed a successful delete
  and confirmed the row changed. Negative-only tests pass just as happily when the feature is
  broken for everybody. Both positive paths are now covered.
- Tests also have to build the row the real code path builds. The attachment probe inserted without
  `created_by`, which no real upload does, and that gap hid the authorship hole until the delete
  check forced the row to be realistic.

### 2026-09-24 — Phase 3, Projects, credentials, and files

**Added**

- Migration `0005_projects.sql`: `projects` and `project_websites`, the `project_status` enum, a
  unique project code per workspace, a check that a due date cannot precede a start date, RLS, and
  the soft-delete guard.
- Migration `0006_credentials.sql`: `credentials`, `credential_access_log`, and the
  `create_credential` / `update_credential` / `reveal_credential` / `delete_credential` security
  definer functions.
- Migration `0008_attachments.sql`: the polymorphic `attachments` table, both private storage
  buckets, and storage policies keyed on the workspace path prefix.
- `features/projects/`, `features/credentials/`, and `features/shared/attachments/` per the module
  contract.
- `/projects` with search, filters, and pagination; `/projects/new`, `/projects/[id]`,
  `/projects/[id]/edit`. The detail page has Overview, Websites, Credentials, Files, and Tasks.
- `POST /api/upload`: the first route handler. Permission, then size, then MIME, then the object,
  then the row.
- Files tabs on both projects and contacts, from the same `AttachmentsPanel`. Adding `'invoice'` to
  `ENTITY_TYPES` would give invoices file uploads with no migration — the polymorphic design paying
  out for the first time.
- The Projects tab on a contact is live, with a "New project" link that pre-selects the client.

**Changed**

- `lib/permissions.ts`: credential `delete` is `manager`, not `admin`, matching what
  `delete_credential` actually enforces. A manager can already delete the project a credential hangs
  off, so the stricter UI only disagreed with the boundary.

**Security**

- **pgsodium, which section 7.3 specifies, is deprecated by Supabase and not installed.** Verified
  what was actually available before choosing: pgcrypto and Vault 0.3 are both installed, so
  encryption stayed in the database as designed rather than moving into application code.
- The encryption key is generated randomly *inside* the database by the migration and stored in
  Vault. It is never written to a file, an environment variable, or the repo, so there is no copy to
  leak, and a `pg_dump` contains ciphertext with nothing that decrypts it. `credential_key()` is
  callable by neither `authenticated` nor `anon`.
- `reveal_credential` writes the access-log row **before** returning plaintext, in the same
  transaction. A reveal that succeeds is always a reveal that was recorded.
- `credentials` has no INSERT, UPDATE, or DELETE policy. Writes happen only through the security
  definer functions, so a direct insert cannot skip the encryption or the log. The ciphertext
  columns are excluded from the column grants, so a client cannot even ask for them.
- The access log has no UPDATE or DELETE policy. Nobody erases an audit trail, admins included.
- Storage policies match on the first path segment being the caller's workspace. Verified: an upload
  to another workspace's prefix is refused, and an anonymous download fails even with the exact
  object path.
- An attachment cannot be repointed at a different object, which would let someone swap a file's
  contents while keeping its name and history.

**Fixed**

- `0007_credentials_search_path_fix.sql`: the functions in `0006` called `pgp_sym_encrypt`
  unqualified while pinning `search_path = public`, and pgcrypto lives in `extensions`. Every
  credential write failed until this. Schema-qualified rather than widening the path — a permissive
  `search_path` on a security definer function is how a caller gets it to run their code instead.
- The upload route returned 400 "malformed upload" for an oversized file, because the body parser
  gave up before the size check ran. Content-Length is now checked before the body is read, so the
  limit is enforced deliberately rather than by accident, and the caller gets a 413 that says why.

**Files touched:** `supabase/migrations/000{5,6,7,8}_*.sql`, `src/features/{projects,credentials,shared/attachments}/**`,
`src/app/(app)/projects/**`, `src/app/api/upload/route.ts`, `src/app/(app)/contacts/[id]/page.tsx`,
`src/lib/permissions.ts`, `scripts/verify-rls.mjs`

**Migration:** `0005_projects.sql`, `0006_credentials.sql`, `0007_credentials_search_path_fix.sql`,
`0008_attachments.sql`. All applied to `wjtokyywsuummyaumyty`.

**Notes:**

- Verified: 47/47 RLS and encryption checks, 19/19 end-to-end checks over HTTP. The encryption
  checks assert the stored bytes are *not* the plaintext, that a reveal returns the original, and
  that exactly one log row appears per reveal.
- **`supabase.auth.signOut()` signs out globally by default** — it revokes every session for that
  user, on every device, not just the current one. Worth deciding whether that is the behaviour you
  want for a CRM people use on a phone and a desktop; `{ scope: 'local' }` changes it. Recorded as a
  Known Issue rather than changed unilaterally.
- Two credential forms rather than one with a union type. The single form only typechecked with
  `as never`, which was the compiler pointing at the design rather than at itself.
- Deleting an attachment soft-deletes the row and deliberately leaves the object in the bucket.
  Storage is not transactional with the database, so removing the file first and failing the row
  update would leave a row pointing at nothing.

### 2026-09-24 — Fix: schemas were not idempotent, so no form with an empty optional field could save

**Fixed**

- Creating a contact always failed with "Check the details below." and marked no field.
- Saving your profile with an empty phone or job title failed the same way. Shipped in Phase 1,
  found only while investigating the contacts report.

**Root cause.** React Hook Form's `handleSubmit` passes the submit handler the resolver's
**output**, so a form submits transformed values. The server action then re-validates that output
with the same schema, because the client is not trustworthy. The optional-text helper was
`z.string().optional().transform(v => v?.trim() || null)`: it emits `null` but only accepts
`string | undefined`, so the second parse rejected every empty optional field. Thirteen fields
failed on a blank contact form.

It was invisible because the failures landed on `companyName` — hidden when the type is "person" —
and on `address.*`, and `error.flatten().fieldErrors` collapses nested paths onto the parent key,
which matches no input. So nothing rendered but the generic banner.

**Changed**

- New `src/lib/zod.ts` with `optionalText` and `optionalId`, both `.nullish()` so their own output
  parses again. Contacts and users schemas now use them.
- `fieldErrorsFromZod` keys errors by dotted path (`address.city`), which is how React Hook Form
  addresses nested fields, so messages land on the right input.
- `firstIssueMessage` replaces the fixed "Check the details below." string, so an error on a field
  the form is not currently rendering is still legible. All six actions use both.
- New `scripts/verify-schemas.ts` and `npm run verify:schemas`: asserts `parse(parse(x))` succeeds
  and is stable, for all 12 schemas. Added `tsx` as a dev dependency to run it.

**Files touched:** `src/lib/zod.ts`, `src/features/contacts/schema.ts`, `src/features/users/schema.ts`,
`src/features/{auth,users,contacts}/actions.ts`, `scripts/verify-schemas.ts`, `package.json`

**Migration:** none

**Notes:**

- **Why the tests missed it.** Both end-to-end harnesses called the actions with hand-written raw
  input — strings and omitted keys. A real form sends transformed output. The harness was testing a
  payload no browser ever produces. Re-verified by submitting the exact post-transform payload,
  which fails against the old code and passes against the new.
- The lesson generalises past Zod: when a boundary transforms data, test it with what actually
  crosses it, not with what is convenient to type in a test.

### 2026-09-24 — Deployed, and Phase 2, Contacts

**Added**

- **Deployed to Vercel: https://wallxer-crm-pro.vercel.app.** Phase 0 is now complete.
- Migration `0004_contacts.sql`: the `contacts` table, a generated `search_vector`, seven indexes,
  a soft-delete guard trigger, and RLS.
- `features/contacts/` following the module contract, plus `features/brands/queries.ts` and
  `listAssignableUsers` in `features/users/queries.ts` so contacts never reaches into another
  feature's internals.
- `/contacts` with database-side pagination, full-text search, and filters on type, status, brand,
  owner, and tag. Filter state lives in the URL, so a filtered list is linkable.
- `/contacts/new`, `/contacts/[id]`, `/contacts/[id]/edit`. The detail page has the tabs from
  section 8.2; only Overview is real, the rest name the phase that fills them.
- People link to companies through `parent_contact_id`, and a company lists its people.
- Delete offers an Undo in the toast, which works because managers can still see deleted rows.
- `TagInput` and `Pagination` in `components/common/`.

**Changed**

- Supabase Site URL moved from `http://localhost:3000` to the Vercel URL, with both in the redirect
  allow list so local development still works.
- `verify-rls.mjs` now covers contacts: 22 checks to 30.
- `ContactFilters` adjusts search state during render rather than in an effect. The effect version
  rendered the stale value once and then immediately re-rendered, and failed lint.

**Security**

- No DELETE policy on `contacts` at all. Removal is only ever `deleted_at`, which makes invariant 6
  of section 0 ("nothing is hard deleted") true at the database rather than by convention.
- Soft delete is an UPDATE, so the UPDATE policy cannot separate editing from deleting. A trigger
  does, restricting both delete and restore to manager and above. Verified: a member gets
  `Only a manager or above can delete a contact`.
- Deleted rows remain visible to manager and above only. That is what makes Undo and a future trash
  view possible without the service role.
- A `contacts_name_present` check constraint rejects a contact with no name, mirrored by a Zod
  refine so the user sees which field is empty rather than a database error.

**Files touched:** `supabase/migrations/0004_contacts.sql`, `src/features/contacts/**`,
`src/features/brands/**`, `src/app/(app)/contacts/**`, `src/components/common/**`,
`src/features/users/queries.ts`, `scripts/verify-rls.mjs`

**Migration:** `supabase/migrations/0004_contacts.sql`, applied to `wjtokyywsuummyaumyty`.

**Notes:**

- Verified: 30/30 RLS checks, 25/25 contacts end-to-end checks, and 13/13 production checks against
  the live Vercel URL, including that the service role key appears nowhere in served HTML.
- The design specified an expression index for search. A stored generated `search_vector` column
  replaced it: PostgREST cannot reproduce an index expression in a query, so the expression index
  would never have been used. `.textSearch('search_vector', q, { type: 'websearch' })` does.
- `next typegen` must be re-run after adding a dynamic route, or `PageProps<'/contacts/[id]'>` fails
  to typecheck against a stale route union. `npm run build` does it; `tsc --noEmit` alone does not.
- A second real user exists now (Ashik Ahmed, manager), added through the UI. An RLS assertion that
  hardcoded "exactly one profile" started failing because of it and was loosened to `>= 1` —
  coupling a security check to headcount makes it fail on hiring.

### 2026-09-24 — Phase 1, Users management

**Added**

- Migration `0003_users_management.sql`: `profiles.must_change_password`, `invited_by`,
  `invited_at`, a `touch_last_seen()` function, and an extended privileged-column guard.
- `features/users/` following the module contract: `schema.ts`, `queries.ts`, `actions.ts`,
  `components/`.
- `/settings/users`: the team list with role, status, and last seen, an Add user dialog, and row
  actions for changing role, suspending, reactivating, and resetting a password.
- Two ways to add a user. An email invite via `inviteUserByEmail`, and a temporary password shown
  to the admin exactly once. The second exists because the built-in Supabase mailer allows two
  messages an hour and may not deliver outside the Supabase organisation.
- `/set-password` and `/auth/callback`, completing the invite-acceptance flow that Phase 0 left as
  a known issue. The callback handles all three session shapes Supabase can send.
- `/settings/profile`: edit your own name, job title, phone, and timezone, and change your password.
  The Profile entry in the user menu is no longer disabled.
- `last_seen_at`, written through an RPC throttled to one write per five minutes.

**Changed**

- `requireUser()` now diverts to `/set-password` when `must_change_password` is set, so a
  handed-over password cannot quietly become a permanent one.
- `SetPasswordForm` takes `redirectTo`, `submitLabel`, and `successMessage`, so the same form serves
  invite acceptance and a self-service password change.
- Both Select fields moved from `watch`/`setValue` to `Controller`. `watch()` cannot be memoised, so
  React Compiler was skipping those components entirely.
- `scripts/verify-rls.mjs` creates a throwaway member account and tears it down, covering the
  restrictions rather than only the permissions. 11 checks to 22.

**Security**

- A member POSTing directly to `inviteUser` with `role: super_admin` is refused. Verified, not
  assumed: the button is not the check, `requireActor` in the action is.
- `inviteUser` refuses to create a super admin unless the caller is one. The role travels in user
  metadata and `handle_new_user` trusts it on INSERT, where the privileged-column trigger does not
  apply, so this gap is only closable in the action.
- `resetUserPassword` refuses to reset a super admin's password unless the caller is a super admin.
  Resetting it is a full account takeover.
- An admin can no longer suspend their own account, which was the other easy route to locking the
  workspace out of user management.
- `must_change_password` is server-set. The guard trigger rejects any client write to it.

**Files touched:** `supabase/migrations/0003_users_management.sql`, `src/features/users/**`,
`src/features/auth/**`, `src/app/(app)/settings/**`, `src/app/(auth)/**`, `src/lib/auth.ts`,
`src/lib/env.ts`, `src/components/layout/**`, `scripts/verify-rls.mjs`

**Migration:** `supabase/migrations/0003_users_management.sql`, applied to `wjtokyywsuummyaumyty`.

**Notes:**

- Verified: 22/22 RLS checks, and 19/19 end-to-end checks driving the real server actions over HTTP.
- **The email-invite path is written but untested**, because the project has no SMTP. It cannot be
  confirmed until custom SMTP exists. The temporary-password path is fully tested.
- Two design contradictions were resolved rather than guessed at. See the Decision Log.
- Testing server actions over HTTP: a route exposes every action imported anywhere in its tree, and
  they are indistinguishable by id from outside. `signOut()` ignores its arguments and returns
  `ok: true`, so a harness that probes ids and stops at the first success both reports a false pass
  and destroys its own session. Identify an action by its effect on the database.

### 2026-09-24 — Phase 0 foundation

**Added**

- Next 16 app scaffolded with TypeScript, Tailwind v4, and shadcn/ui, plus TanStack Query and
  Table, React Hook Form, Zod, and date-fns.
- Supabase clients: browser, user-scoped server, and service role. The service-role module imports
  `server-only`, so an accidental client import fails the build instead of leaking the key.
- `src/proxy.ts` for session refresh and the logged-out redirect, with an open-redirect guard on
  the `next` parameter.
- Migration `0001_foundation.sql`: `workspaces`, `brands`, the `user_role` and `user_status` enums,
  `profiles`, the shared `set_updated_at` trigger, `handle_new_user` on `auth.users`, and
  `handle_user_confirmed` to flip `invited` to `active` when an invite is accepted.
- Migration `0002_rls_helpers.sql`: `auth_workspace_id()`, `auth_role()`, `is_admin()`,
  `is_super_admin()`, `is_manager()`, RLS policies on all three foundation tables, explicit grants,
  and a trigger guarding `role`, `status`, and `workspace_id` on `profiles`.
- `seed.sql`: the `Agency` workspace and the five brands. Idempotent.
- `scripts/bootstrap-admin.mjs` creates the first super admin through the Admin API.
- `scripts/verify-rls.mjs` asserts the policies actually hold against the real database. Extend it
  in the same commit as any migration that adds a table or changes a policy.
- Login page, `(auth)` and `(app)` route groups, app shell (sidebar, topbar, user menu, page
  header), `EmptyState`, and a dashboard shell.
- Stub pages for every sidebar route so navigation never 404s before a module is built.
- `lib/auth.ts` (`getCurrentUser`, `requireUser`, `requireRole`), `lib/permissions.ts`,
  `lib/entities.ts`, `lib/action-result.ts`, `lib/env.ts`.

**Changed**

- Next 15 to Next 16, which renames `middleware.ts` to `src/proxy.ts`.
- `auth_workspace_id()` now requires `status = 'active'`. See the Decision Log.
- Rewrote shadcn's generated `use-mobile.ts` to use `useSyncExternalStore`. Its version set state
  inside an effect, which rendered once at the wrong width and failed lint.
- Renamed `changeslog.md` to `CHANGELOG.md` and `system_design.md` to `SYSTEM_DESIGN.md`, matching
  the names both documents already referred to.

**Security**

- Public signup was found enabled on the new project and has been disabled. Verify it with the
  Management API, not by attempting a signup: a probe against `@example.com` fails with
  `Email address is invalid` whether signups are open or not, which reads like a pass. The
  definitive rejection is `Signups not allowed for this instance`.

      curl -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
        "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/config/auth" \
        | grep disable_signup   # must be true
- `anon` has no grants on any table. Verified: an unauthenticated client gets
  `permission denied for table brands`, not an empty list.

**Files touched:** the initial tree. See commit history.
**Migration:** `supabase/migrations/0001_foundation.sql`, `supabase/migrations/0002_rls_helpers.sql`,
`supabase/seed.sql`. All three applied to project `wjtokyywsuummyaumyty`.

**Notes:**

- Verified against the running app: 11/11 RLS checks pass, 5/5 logged-out route checks, 8/8
  logged-in checks. The last-super-admin guard and the anon lockout are both confirmed by test, not
  by inspection.
- Verified again on `next dev` at port 3000, including the login server action end to end: a correct
  password returns `{"ok":true}` and sets the session cookie, a wrong one returns the deliberately
  vague "That email and password do not match an account."
- Server action IDs differ between the dev and production builds. When invoking an action directly
  for testing, read the id from the matching manifest — `.next/dev/server/...` for `next dev`,
  `.next/server/...` for `next start` — or the request 404s for a reason that has nothing to do
  with the code.
- `npm run types:generate` overwrites `src/types/database.types.ts` wholesale. Run it after every
  migration and commit the result, or every query in the next session is typed against a schema
  that no longer exists.

### 2026-09-19 — Project design

**Added**

- System design document covering stack, data model, security, module specs, build phases,
  cost, and future roadmap.
- This changelog.

**Files touched:** SYSTEM_DESIGN.md, CHANGELOG.md
**Migration:** none
**Notes:** No code written yet. Design is approved and ready to build from.

---

## Decision Log

Decisions and the reasoning behind them. Add to this whenever you choose between real options,
so nobody relitigates a settled question six months from now.

| Date       | Decision                                                                        | Reason                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-19 | Supabase plus Next.js App Router                                                | Fits the budget, RLS gives real security without a backend service, one language across the stack.                                |
| 2026-09-19 | One shared workspace, brands as a tag                                           | The team works across all brands and needs to see everything. Brand stays a filter, not a wall.                                   |
| 2026-09-19 | `workspace_id` on every table anyway                                            | Costs nothing now, makes multi tenancy or brand separation a policy change later instead of a rewrite.                            |
| 2026-09-19 | Credentials encrypted with pgsodium, whole team can reveal, every reveal logged | The team shares client accounts daily, so blocking access would be worked around. The access log provides accountability instead. |
| 2026-09-19 | Supabase Storage, not R2                                                        | The workload is documents and images only, which fits the free tier. The `attachments.bucket` column keeps the move to R2 cheap.  |
| 2026-09-19 | Deal value columns exist but stay hidden                                        | You do not need money tracking yet, but adding a column to a live table with data is more painful than hiding one.                |
| 2026-09-19 | Polymorphic `attachments`, `comments`, `resource_links`, `activity_log`         | New modules inherit files, links, discussion, and history without new tables.                                                     |
| 2026-09-19 | `task_assignees` junction table despite single assignment in v1                 | Going from one assignee to many is then a UI change, not a data migration.                                                        |
| 2026-09-19 | `entity_type` as text, not an enum                                              | Adding a module must not require altering a type that four tables depend on.                                                      |
| 2026-09-19 | Soft deletes everywhere                                                         | Client and project history is the point of a CRM. Nothing should be permanently destroyable by accident.                          |
| 2026-09-19 | Users management built in Phase 1, before contacts                              | Every other module's permissions need real accounts to test against.                                                              |
| 2026-09-19 | `position numeric` for drag and drop ordering                                   | Reordering updates one row instead of renumbering an entire column.                                                               |
| 2026-09-24 | Next 16 rather than the Next 15 named in the design | 16 was stable at build time and the App Router model is unchanged. Starting greenfield on a superseded major buys an upgrade chore for nothing. |
| 2026-09-24 | `auth_workspace_id()` requires `status = 'active'` | The design's version returned a workspace for suspended users, so suspension would not have suspended anything. Denying at this one function makes every policy deny at once. |
| 2026-09-24 | shadcn `field` instead of `form` | The registry no longer ships `form`. `field` composed with React Hook Form is the current pattern; the Zod schema boundary is unaffected. |
| 2026-09-24 | Develop against the hosted Supabase project, not a local stack | Docker is not installed on the dev machine. One project for now; add a staging project once a second person writes code. |
| 2026-09-24 | Seed creates the workspace and brands only; a script creates the first admin | A profile needs a matching `auth.users` row, and hand-forging one in SQL is fragile. `scripts/bootstrap-admin.mjs` goes through the Admin API instead. |
| 2026-09-24 | The last active super admin cannot be demoted or suspended, service role included | Losing the only super admin locks the workspace out of user management with no path back through the UI. Promote a replacement first. |
| 2026-09-24 | Stub pages for unbuilt modules rather than no route at all | The sidebar doubles as the roadmap, and a stub that names its phase reads as deliberate where a 404 reads as a bug. |
| 2026-09-24 | `scripts/verify-rls.mjs` kept as a permanent script | A policy that silently fails open looks exactly like one that works. The only way to know is to assert it against the real database after every schema change. |
| 2026-09-24 | Users can be added by email invite **or** by a temporary password shown once | Supabase's built-in mailer allows 2 messages an hour and may not deliver outside the Supabase org. Shipping only the email path would have made Phase 1 untestable and onboarding impossible until SMTP existed. |
| 2026-09-24 | Role changes stay super-admin only, resolving the §4 / §7.2 contradiction | §7.2 is the one backed by a database trigger. Loosening it would mean weakening an enforced rule to match prose; tightening the prose costs nothing. |
| 2026-09-24 | No per-user brand access, resolving the §8.6 / §1 contradiction | §8.6 mentioned "brand access" but no such model exists in §5, and §1 plus the original Decision Log say brands filter and never isolate. Inventing a permission model to satisfy one clause would have contradicted the architecture. |
| 2026-09-24 | A handed-over password forces a change via `must_change_password`, guarded server-side | A temporary password passed over chat is a shared secret. Making the flag client-writable would put skipping the change one API call away. |
| 2026-09-24 | Admin-initiated "reset password" issues a new temporary password rather than emailing a link | Same email constraint. It also works identically whether or not SMTP is ever configured, so the recovery path never depends on deliverability. |
| 2026-09-24 | `/auth/callback` is a client component handling three token shapes | Which shape Supabase sends depends on the flow and the email template, neither of which this app controls. The `#access_token` fragment never reaches a server route handler at all. |
| 2026-09-24 | A stored generated `search_vector` column instead of the expression index in §5.2 | PostgREST cannot reproduce an index expression in a query, so the expression index would have been built and never used. A generated column is queryable through `.textSearch()` and indexes identically. |
| 2026-09-24 | `contacts` has no DELETE policy at all | Invariant 6 of §0 is "nothing is hard deleted". Omitting the policy makes that true at the database instead of relying on every future caller remembering to soft delete. |
| 2026-09-24 | Deleted contacts stay visible to manager and above | Undo after a delete, and a trash view later, both need to read a deleted row. The alternative is a service-role round trip for an everyday action. |
| 2026-09-24 | A trigger, not the UPDATE policy, restricts soft delete | Deleting is an UPDATE that sets `deleted_at`, so one policy cannot tell "a member fixed a phone number" from "a member deleted the client". Only a trigger can see which column changed. |
| 2026-09-24 | No TanStack Table for contacts, despite §2 naming it | Sorting, filtering, and pagination all happen in Postgres, so the client table renders rows and nothing more. Adding a table library to render a `<table>` is weight without a job. Revisit if column reordering or row selection is ever wanted. |
| 2026-09-24 | Filter state lives in the URL | A filtered list becomes linkable and survives a refresh, and it is what lets the server component do the filtering. Component state would mean shipping every contact to the browser. |
| 2026-09-24 | pgcrypto with the key in Supabase Vault, instead of §7.3's pgsodium | pgsodium is deprecated by Supabase and not installed on this project. Checked what existed before choosing. pgcrypto and Vault are both installed, so encryption stays in the database — the alternative, §7.3's app-layer AES fallback, would have moved decryption into code where "every reveal is logged" becomes a convention a future code path can skip. |
| 2026-09-24 | The encryption key is generated inside the database, never in a file or env var | There is then no copy of it to leak, lose, or commit. Vault encrypts it at rest with a root key held outside the database, so a `pg_dump` is ciphertext with nothing that decrypts it. The cost is that rotation needs a re-encryption script, which does not exist yet. |
| 2026-09-24 | `credentials` has no INSERT, UPDATE, or DELETE policy at all | Writes go only through the security definer functions. A direct insert would store an unencrypted "secret" and skip the access log, and a policy permissive enough to allow legitimate writes cannot tell the two apart. |
| 2026-09-24 | Ciphertext columns excluded from the column grants | RLS filters rows, not columns. Without column grants a client could select `secret_encrypted` and take the ciphertext away to attack offline. |
| 2026-09-24 | Deleting an attachment leaves the object in the bucket | Storage is not transactional with the database. Removing the file first and failing the row update leaves a row pointing at nothing — a broken download instead of a recoverable mistake. A sweep can reclaim the space later. |
| 2026-09-24 | Credential add and edit are two form components, not one | Creating requires a secret and editing must not, because the edit form never shows the stored value — requiring it would force a reveal, logged as an access that never needed to happen, just to fix a label. One `useForm` covering both only typechecked with `as never`. |
| 2026-09-24 | A soft-deletable table's SELECT policy must keep the deleted row visible to whoever may delete it | Postgres checks the row an UPDATE produces against the SELECT policy. A policy ending in a bare `deleted_at is null` rejects its own soft delete, which is how file deletion shipped broken for every user. |
| 2026-09-24 | `created_by` on attachments is constrained on insert and immutable after | The right to delete your own file is derived from it. A column the user can set freely cannot carry a permission. |
| 2026-09-25 | Every dashboard view is `security_invoker = on` | A Postgres view runs as its owner by default and bypasses the querying user's RLS. A dashboard built that way shows one workspace's numbers to another's users and looks entirely correct doing it. |
| 2026-09-25 | The dashboard reads views, never tables | Section 8.1. A count written by hand in the page drifts the first time a module changes its filters. The views apply the same conditions the lists do, in one place, so the two cannot disagree. |
| 2026-09-25 | `activity_log` carries a denormalised `label` in `changes` | The feed would otherwise need a join per row across four tables. It also means an entry keeps the name the record had at the time, which for a record of what happened is arguably more truthful than today's name. |
| 2026-09-25 | No chart library for the pipeline summary | Section 8.1 asks for "a simple bar" and these are div widths. Five of them do not justify a dependency. |
| 2026-09-25 | A deal's `status` and `closed_at` are derived from its stage by a trigger | Dragging a card into Won is how a deal is won; nobody wants to then remember a separate status field. Two sources of truth for the same fact is how they come to disagree, so the action does not send either. |
| 2026-09-25 | `deal_stage_history` is written only by a trigger, with no write policies at all | It is the raw material for velocity and conversion reporting, and it cannot be backfilled. A row nobody can forge or erase is worth more than one the app remembers to write. |
| 2026-09-25 | The default pipeline is created by the migration, not seed.sql | seed.sql has already run against the live project, and a first-run experience should not depend on someone remembering to re-run it. A board with no stages is not a board. |
| 2026-09-25 | Archiving a stage holding deals is refused, with a count | Archiving hides the stage from the board, and with it any deals sitting in it, with no route back. Refusing with a number is more useful than silently losing work. |
| 2026-09-25 | Deal values are hidden from the form too, not just from displays | A half-filled amount on a workspace that has chosen not to track money is worse than no amount: it looks like data. |
| 2026-09-25 | Task assignment is restricted in step with task editing | A member may edit tasks assigned to them. If assignment were open, assigning yourself any task would be a one-step route to editing everything — the permission would grant itself. |
| 2026-09-25 | `completed_at` is set by a trigger, not the app | It must not drift from `status`, and Phase 6's dashboard counts depend on it. A write that bypasses the app still leaves an honest timestamp. |
| 2026-09-25 | The board uses the HTML5 drag API, not a drag-and-drop library | Five columns, one card at a time. A library would be more code and another dependency for behaviour the platform already has. Revisit for multi-select or nested sorting. |
| 2026-09-25 | Task list and board share one set of URL filters | The view is how the same results are drawn, not which results they are. Clearing filters therefore keeps the view. |
| 2026-09-25 | The calendar view from §8.5 is deferred, not dropped | A month grid is a separate component with its own navigation, and the due-window filters answer "what is coming up", which is most of what the calendar was for. Recorded as a Known Issue. |
| 2026-09-24 | Upload is a route handler, not a server action | Server actions serialise arguments through the RSC protocol, which is a poor fit for a 25 MB binary. The route streams straight to storage. |

---

## Known Issues

Anything broken, half finished, or deliberately deferred. Empty is good. Hiding things here is worse
than the bug itself.

| Date       | Issue                                                                                                                                                        | Severity | Status                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------- |
| 2026-09-24 | Public signup was left enabled on the new project. Anyone with the project URL could have created an account. Fixed via the Management API, confirmed by `Signups not allowed for this instance`. Re-check after any project is recreated — nothing in the repo can enforce it. | High     | Fixed 2026-09-24                        |
| 2026-09-24 | `/set-password` did not exist, so invites could not be accepted.                                                                                              | Medium   | Fixed 2026-09-24, Phase 1               |
| 2026-09-24 | `scripts/verify-rls.mjs` only exercised a super admin, so it could not prove restrictions restrict.                                                            | Medium   | Fixed 2026-09-24, now 22 checks          |
| 2026-09-24 | Profile menu and password change were disabled in the user menu.                                                                                              | Low      | Fixed 2026-09-24, `/settings/profile`   |
| 2026-09-24 | `signOut()` uses Supabase's default global scope, so signing out on one device ends every session for that user. Change to `{ scope: 'local' }` if that is not wanted. | Low | Open, needs a decision |
| 2026-09-24 | Deleting an attachment leaves the object in the bucket by design. Nothing sweeps them, so storage use only grows. Add a periodic purge of objects whose rows have been deleted for 30+ days. | Low | Open, revisit before storage fills |
| 2026-09-24 | Credential key rotation is unimplemented. Rotating it means re-encrypting every row, and there is no script for that. | Low | Open, write it before it is needed |
| 2026-09-25 | The task calendar view from §8.5 is not built. List, board, and due-window filters cover the same ground for now. | Low | Open, deferred |
| 2026-09-25 | Priority sorting happens in JavaScript after fetching a page, because `task_priority` is an enum and Postgres orders enums by declaration. Correct within a page, wrong across pages. Needs a `priority_weight` column if it matters. | Low | Open |
| 2026-09-25 | v1 assigns one person per task. The junction table supports many, and the UI does not. | Low | Open, by design |
| 2026-09-24 | No SMTP. The email-invite path is written but has never been executed, and password-reset-by-email does not exist. Temporary passwords cover both for now.     | Medium   | Open, needs custom SMTP                 |
| 2026-09-24 | No backups configured. The free tier's are limited, and §10 calls this the one gap that can actually hurt.                                                     | Medium   | Open, needs a weekly `pg_dump` reminder |
| 2026-09-24 | Not deployed, and Supabase's Site URL still pointed at localhost.                                                                                              | Medium   | Fixed 2026-09-24                        |
| 2026-09-24 | `listUsedTags` reads up to 2,000 contacts to build the tag filter list. Fine now, wrong once the imported lists land. Replace with a distinct-tag view or a tags table when it bites. | Low | Open, revisit in Phase 7 |
| 2026-09-24 | `listCompanyOptions` caps the "Works at" picker at 500 companies. Beyond that the picker silently omits some; it needs to become a search. | Low | Open, revisit when it matters |
| 2026-09-24 | Deleted contacts can only be restored via the Undo toast. There is no trash view, so a delete dismissed without undoing needs a manager and a hand-written query. | Low | Open, Phase 7 |

---

## Open Questions

Carried from Section 14 of the design doc. Move each one into the Decision Log when answered.

1. Should `member` role see all credentials, or only those on projects they are assigned to?
   Currently all.
2. Contact deduplication rule for CSV import: email only, or email plus phone?
3. Notification channel once notifications are built: in app, email, or WhatsApp.
4. Retention policy for `activity_log` once it grows large.

---

## Released versions

Nothing released yet. When Phase 7 ships, move the Unreleased entries into a `## [1.0.0]` section
dated that day.

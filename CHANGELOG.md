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

**Last updated:** 2026-09-24
**Phase:** 2 complete. Phases 0, 1, and 2 all done.
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
| Projects, credentials, files      | Not started          | Phase 3                                  |
| Tasks                             | Not started          | Phase 4                                  |
| Pipeline                          | Not started          | Phase 5                                  |
| Dashboard                         | Shell only           | Phase 6 builds the real widgets          |
| Polish and search                 | Not started          | Phase 7                                  |

### Migrations applied

| Migration              | Applied to `wjtokyywsuummyaumyty` |
| ---------------------- | --------------------------------- |
| `0001_foundation.sql`  | Yes, 2026-09-24                   |
| `0002_rls_helpers.sql` | Yes, 2026-09-24                   |
| `0003_users_management.sql` | Yes, 2026-09-24              |
| `0004_contacts.sql`    | Yes, 2026-09-24                   |
| `seed.sql`             | Yes, 2026-09-24                   |

### Environment variables in use

Set in `.env.local`, which is gitignored. `.env.example` lists them with no values.

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_APP_URL`, plus `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, and
`SUPABASE_ACCESS_TOKEN` for the CLI. `CREDENTIAL_ENCRYPTION_KEY` and `SENTRY_DSN` are empty until
Phases 3 and 7.

### Useful commands

| Command                    | Does                                                     |
| -------------------------- | -------------------------------------------------------- |
| `npm run db:push`          | Applies pending migrations to the linked project         |
| `npm run db:seed`          | Runs `seed.sql` against the linked project               |
| `npm run types:generate`   | Regenerates `src/types/database.types.ts`                |
| `npm run bootstrap:admin`  | Creates or promotes a super admin                        |
| `npm run verify:rls`       | Asserts the policies hold. Needs `CHECK_EMAIL` and `CHECK_PASSWORD` |
| `npm run verify:schemas`   | Asserts every Zod schema is idempotent. Run after touching one     |

---

## Next Up

**Phase 3, Projects, websites, credentials, and files.** The biggest phase, and the only one with a
cryptography decision in it.

1. Migration `0005_projects.sql`: `projects`, `project_websites`, the `project_status` enum, RLS,
   and the standard soft-delete guard from `0004`.
2. Migration `0006_credentials.sql`: `credentials`, `credential_access_log`, the
   `credential_category` enum, and the `create_credential` / `reveal_credential` security definer
   functions from section 7.3.
3. **Decide the encryption approach first.** Section 7.3 specifies pgsodium with a key in Supabase
   Vault, and names an application-layer AES-256-GCM fallback in `lib/crypto.ts`. pgsodium has been
   deprecated in Supabase for new projects, so confirm what is actually available before writing
   the migration, and record the choice in the Decision Log either way.
4. `features/projects/` and `features/credentials/` per the module contract.
5. `features/shared/attachments/` plus the `attachments` table, the two storage buckets, and the
   upload route handler from section 7.4. This is the first polymorphic subsystem, so it sets the
   pattern the rest inherit.
6. Wire the Files and Projects tabs on the contact detail page, which currently say "Phase 3".
7. Extend `scripts/verify-rls.mjs`: a revealed credential writes an access-log row, a member cannot
   read `secret_encrypted` directly, and storage policies reject a path outside the workspace.

**Definition of done for Phase 3:** a project can be created against a client contact, given a
credential that round-trips through encrypt and reveal with the reveal logged, and given an
uploaded file that downloads through a signed URL and cannot be fetched without one.

---

## Unreleased

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

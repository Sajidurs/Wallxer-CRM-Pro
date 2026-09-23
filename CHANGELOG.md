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
**Phase:** 0 (complete locally, not yet deployed)
**Deployed:** no
**Supabase project:** `wjtokyywsuummyaumyty`, free tier
**Repo:** https://github.com/Sajidurs/Wallxer-CRM-Pro, branch `main`

### What exists

- Next 16 app: App Router, TypeScript, Tailwind v4, shadcn/ui (radix / nova preset).
- Supabase clients for browser, server, and service role.
- `src/proxy.ts`: session refresh and the logged-out redirect.
- Login page, protected `(app)` route group, app shell with sidebar, topbar, and user menu.
- Dashboard shell with placeholder counters. Stub pages for every sidebar route, so nothing 404s.
- Workspace `Agency` and all five brands seeded. One super admin exists.

### Modules status

| Module                            | Status               | Notes                                    |
| --------------------------------- | -------------------- | ---------------------------------------- |
| Foundation (auth, workspace, RLS) | Done, not deployed   | Only step 10 of Phase 0 remains          |
| Users management                  | Not started          | Phase 1, next up                         |
| Contacts                          | Not started          | Phase 2                                  |
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

---

## Next Up

**Finish Phase 0.** One step is left:

1. Deploy to Vercel. Import the GitHub repo, add the four runtime environment variables
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `NEXT_PUBLIC_APP_URL` set to the deployed URL), then confirm login works in production.
   Add the deployed URL to Supabase Auth → URL Configuration → Redirect URLs.

**Then Phase 1, Users management.** Built before contacts because every other module's permissions
need real accounts to test against.

1. `features/users/`: `schema.ts`, `queries.ts`, `actions.ts`, `components/`.
2. Invite by email through `lib/supabase/admin.ts` and `auth.admin.inviteUserByEmail`, carrying
   `full_name` and `role` in user metadata — `handle_new_user` already reads both.
3. `/set-password` page for accepting an invite. The route and the Zod schema
   (`setPasswordSchema`) exist; the page does not.
4. Users table: name, email, role, status, last seen. Change role, suspend, reactivate.
5. Own-profile editing, which the user menu currently shows as disabled.
6. Extend `scripts/verify-rls.mjs` with a non-admin user: prove a `member` cannot change a role and
   cannot reach `/settings/users`.

**Definition of done for Phase 0:** a real person can log in on the deployed URL, see an empty
dashboard shell, and be blocked from every route when logged out.
_Locally satisfied and verified. Awaiting the deploy._

---

## Unreleased

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
- Port 3000 is occupied by an unrelated Node process on the dev machine; the local verification ran
  on 3100.
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

---

## Known Issues

Anything broken, half finished, or deliberately deferred. Empty is good. Hiding things here is worse
than the bug itself.

| Date       | Issue                                                                                                                                                        | Severity | Status                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------- |
| 2026-09-24 | Public signup was left enabled on the new project. Anyone with the project URL could have created an account. Fixed via the Management API, confirmed by `Signups not allowed for this instance`. Re-check after any project is recreated — nothing in the repo can enforce it. | High     | Fixed 2026-09-24                        |
| 2026-09-24 | `/set-password` is referenced by `src/proxy.ts` as a public path and has a Zod schema, but the page does not exist. Invites cannot be accepted until Phase 1.  | Medium   | Open, Phase 1                           |
| 2026-09-24 | `scripts/verify-rls.mjs` only exercises a super admin. It cannot yet prove a `member` is restricted, because no second account exists.                        | Medium   | Open, Phase 1 adds the non-admin cases  |
| 2026-09-24 | No backups configured. The free tier's are limited, and §10 calls this the one gap that can actually hurt.                                                     | Medium   | Open, needs a weekly `pg_dump` reminder |
| 2026-09-24 | Profile menu and password change are rendered disabled in the user menu.                                                                                      | Low      | Open, Phase 1                           |

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

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

**Last updated:** 2026-09-19
**Phase:** 0 (not started)
**Deployed:** no
**Supabase project:** not created
**Repo:** not created

### What exists

- `SYSTEM_DESIGN.md` — full architecture, schema, and roadmap.
- `CHANGELOG.md` — this file.

### Modules status

| Module                            | Status      | Notes   |
| --------------------------------- | ----------- | ------- |
| Foundation (auth, workspace, RLS) | Not started | Phase 0 |
| Users management                  | Not started | Phase 1 |
| Contacts                          | Not started | Phase 2 |
| Projects, credentials, files      | Not started | Phase 3 |
| Tasks                             | Not started | Phase 4 |
| Pipeline                          | Not started | Phase 5 |
| Dashboard                         | Not started | Phase 6 |
| Polish and search                 | Not started | Phase 7 |

### Migrations applied

None.

### Environment variables in use

None yet. See Section 13 of the design doc for the full list.

---

## Next Up

Phase 0, Foundation. In this order:

1. Create the Next.js 15 project with TypeScript, Tailwind v4, and shadcn/ui.
2. Create the Supabase project. Disable public signup in Auth settings.
3. Migration `0001_foundation.sql`: `workspaces`, `brands`, `user_role` enum, `user_status` enum,
   `profiles`, the `updated_at` trigger, and the `handle_new_user` trigger on `auth.users`.
4. Migration `0002_rls_helpers.sql`: `auth_workspace_id()`, `auth_role()`, `is_admin()`, and RLS
   policies on the foundation tables.
5. `seed.sql`: one workspace, the five brands (Boost, Falah Chat, Aim Locksmith, Wallxer,
   Elever Notes), and one super admin profile.
6. Supabase clients: `lib/supabase/client.ts`, `server.ts`, `admin.ts`.
7. Login page, session middleware, protected `(app)` route group.
8. App shell: sidebar, topbar, page header, empty state component.
9. Generate `types/database.types.ts` and commit it.
10. Deploy to Vercel and confirm login works in production.

**Definition of done for Phase 0:** a real person can log in on the deployed URL, see an empty
dashboard shell, and be blocked from every route when logged out.

---

## Unreleased

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

---

## Known Issues

Anything broken, half finished, or deliberately deferred. Empty is good. Hiding things here is worse
than the bug itself.

| Date | Issue    | Severity | Status |
| ---- | -------- | -------- | ------ |
| -    | None yet | -        | -      |

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

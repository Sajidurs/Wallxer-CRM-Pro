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
**Phase:** 7 in progress. CSV import done; comments, global search, Sentry and a trash view remain.
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
| Polish and search                 | In progress          | CSV import done; comments, search remain |

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
| `0017_lock_credential_key.sql` | Yes, 2026-09-25          |
| `0018_task_checklist.sql` | Yes, 2026-09-25                |
| `0019_finance.sql`     | Yes, 2026-09-26                   |
| `0020_restore_profile_guard.sql` | Yes, 2026-09-26         |
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
| `npm run backup`           | Logical backup to `backups/<timestamp>/`. See RESTORE.md            |
| Import contacts            | `/contacts/import` — CSV, deduplicated on email                     |
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

### 2026-09-26 — Finance: income, expenses, and the reports built on them

**Added**

The module SYSTEM_DESIGN section 11 sketched as "a new `transactions` table, `brand_id` and
`project_id` foreign keys, new feature folder". Admin-only to begin with, grantable to anyone
afterwards without a deploy.

- **`transactions`** (migration 0019) — kind, amount, date, category, payment method, reference and
  note, linked to a brand, project and client so per-project profit falls out of the same rows.
- **`transaction_categories`**, per kind and seeded with fourteen sensible defaults, so the first
  form is not an empty dropdown. Editable, deactivatable, nothing load bearing.
- **A report page** with weekly, monthly and yearly granularity: income against expense over time,
  where the money went and where it came from by category, and profit by project.
- **The ledger** at `/finance/transactions`, with a record form and soft delete.
- **A Finance switch on each user in Settings → Users**, which is the whole point of the design
  below.

**Access is a grant, not a rank**

Roles here are cumulative, so "let my manager see Finance" expressed as a role would mean promoting
them to admin — which also hands them user management. So `profiles.finance_access` is an exception
list: admins and super admins hold the module implicitly, anyone else holds it because an admin
switched it on. `has_finance_access()` enforces it in every policy; `canAccessFinance()` mirrors it
for the UI, and when they disagree the database wins.

`/finance` returns **404** rather than redirecting. Someone without the grant should not learn the
module exists from the way they are turned away.

**Fixed**

- **0019 silently un-did three protections, and 0020 puts them back.**
  `guard_profile_privileged_columns` is defined in three migrations now: 0002 created it, 0003
  replaced it with an extended version, and 0019 needed one more check. 0019 rebuilt it from
  **0002's** body, which dropped everything 0003 had added — `must_change_password` became
  client-writable (so anyone handed a temporary password could skip the forced change), invite
  provenance stopped being write-once, and an admin could suspend themselves again.
  `create or replace function` has no notion of merging into a base version; it takes the body it is
  handed. Anything replacing a function from an earlier migration has to start from the newest
  definition, and the only way to know which that is, is to grep for every occurrence.
  `verify:rls` caught it: "member cannot set must_change_password" started failing in the same run
  that added the finance checks.

**Notes:**

- **Money is integer poisha, never a float.** `0.1 + 0.2` is not `0.3`, and a ledger that disagrees
  with itself by a poisha a row is worse than one that is tedious to type. The sign lives in `kind`,
  so the amount is always positive and a check constraint refuses zero, negatives, and the extra
  zeroes of a typo.
- **Taka is formatted with `en-IN` grouping and a hand-applied ৳.** `en-BD` returns Western grouping
  and the string "BDT"; `bn-BD` returns Bengali digits. Only `en-IN` gives ৳1,00,00,000 for a crore,
  which is how the number is read here.
- **The report functions are deliberately not `security definer`.** They run as the caller, so the
  policies filter them. A security-definer aggregate would have been a hole straight past the grant
  — which is why one of the checks revokes access and asserts the *report* closes too.
- **The charts are not green-for-income, red-for-expense.** Red and green are precisely the pair
  that protanopes and deuteranopes cannot separate — about one man in twelve — which makes it the
  worst available choice for the two series this page exists to compare. Blue against orange is the
  canonical colourblind-safe opposition. The palette was checked with the data-visualisation
  validator rather than by eye: lightness band, chroma floor, CVD separation, normal-vision floor
  and contrast all pass in both modes, worst CVD ΔE 19.2 against a target of 8. Every chart also
  carries a legend, direct labels and a table view, so nothing is reachable only by reading a bar.
- **13 new RLS checks and 5 new schema checks**, added in the same commit as the migration. They
  prove an ungranted member reads nothing and cannot write, that the report functions close when
  access is revoked, that nobody can hard delete a transaction, and — the one the column exists for
  — that a member cannot grant themselves finance access. `verify:schemas` covers the amount
  transform, which turns a typed string into an integer and so is exactly the shape that caused the
  "check the details below" bug.
- Verified end to end against the production build as three different signed-in users: an ungranted
  member gets 404 and no nav row, an admin sees ৳4,00,000 income and ৳3,10,000 net computed from
  real rows, and granting the member opens both the page and the nav row. 21 of 21.
- **Not included:** invoices, budgets, multi-currency and recurring entries, by decision. Also no
  activity-log rows for transactions — `log_activity` is shared by every table and broke production
  once already in 0016, so extending it deserves its own change rather than riding along with this
  one. Transactions carry `created_by`, `updated_at` and soft delete meanwhile.

**Files touched:** `supabase/migrations/{0019_finance,0020_restore_profile_guard}.sql`,
`src/features/finance/**`, `src/app/(app)/finance/**`, `src/lib/{money,permissions,auth}.ts`,
`src/components/layout/{nav-config,app-sidebar}.tsx`, `src/features/users/**`,
`src/app/globals.css`, `scripts/{verify-rls.mjs,verify-schemas.ts}`

**Migration:** 0019_finance.sql and 0020_restore_profile_guard.sql — both applied


### 2026-09-25 — Page transitions

**Added**

Navigating between pages now crossfades instead of cutting. Built on React's `<ViewTransition>`,
which Next 16 supports in the App Router with no configuration.

- **`PageTransition`** wraps the content area in `(app)/layout.tsx`. The sidebar and topbar sit
  outside it, so they hold still and only the content moves — the page changed, not the viewport.
- The old page leaves in 120ms, the new one fades in over 200ms after an 80ms beat and rises 8px
  over 300ms. Asymmetric on purpose: old content should stop competing for attention quickly, new
  content should arrive gently enough to register.
- **Reduced motion** collapses every duration to zero, which is the browser's own instant swap.
- `::view-transition { pointer-events: none }` so a click during the animation still lands.

**Notes:**

- **The `key` is load-bearing.** Layouts persist across navigations, so a `<ViewTransition>` placed
  in one never unmounts and never fires enter or exit. Keying on `usePathname()` makes React treat
  the old and new page as an exit/enter pair — the mechanism the Next guide uses for same-route
  crossfades.
- **One wrapper element, deliberately.** `<ViewTransition>` names every DOM child it is handed, and
  these pages return fragments of several sections. The first version produced four groups —
  `page-content`, `_1`, `_2`, `_3` — so each section morphed into whatever section happened to
  occupy the same slot on the next page. A header morphing into a header is harmless; a stat strip
  morphing into a filter bar is not. Wrapping in a single `div` gives one group and one crossfade.
- **`height: auto` on the snapshots.** Pages differ in height, and by default each snapshot is
  stretched to the group's interpolated box, which reads as the page being squashed rather than
  crossfaded.
- The root snapshot still crossfades at the browser's 250ms default. That is the sidebar, and it
  makes the active-row highlight change smoothly, so it was left alone.
- **Verified in a real browser, not by reading the diff.** Drove headless Edge over the DevTools
  Protocol — no new dependency, since Node 24 has a native `WebSocket` — signed in, clicked a
  sidebar link, and captured `document.getAnimations()` while the transition was in flight. It
  reports one `page-content` group at 260ms with `page-fade` at 120/200ms and `page-rise` at 300ms,
  which is exactly what the CSS asks for. That capture is also what caught the four-group bug above;
  the first run showed `page-content_1` through `_3` and it would not have been visible in the diff.
  Re-ran with `prefers-reduced-motion: reduce` emulated and every duration reported 0ms.

**Files touched:** `src/components/layout/page-transition.tsx`, `src/app/(app)/layout.tsx`,
`src/app/globals.css`

**Migration:** none


### 2026-09-25 — Subtask checklists, and a progress bar that means something

**Added**

The board's cards now carry the reference's progress bar. It is computed, not stored: ticked
subtasks over total subtasks. A percentage somebody has to remember to drag is a percentage that
goes stale by Thursday.

- **`task_checklist_items`** (migration 0018): title, `is_done`, fractional `position`, and
  `completed_at` / `completed_by` stamped by the database exactly as `tasks.completed_at` is.
- **A checklist panel on the task detail page** — tick, add, remove. Ticking is optimistic, because a
  checkbox that waits for Seoul before it moves feels broken.
- **The progress bar on each board card**, shown only where there is a checklist to measure. A bar
  that is always empty communicates nothing but its own existence.
- **`can_edit_task(uuid)`**, a security-definer function with a pinned search path. A checklist
  inherits its task's edit rule — managers edit anything, a member edits only what is assigned to
  them — and stating it once keeps the four policies from drifting apart.

**Notes:**

- **Hard delete, deliberately.** Invariant 6 guards the records the business is made of; a checklist
  item is a note, not history, and `resource_links` already sits outside the invariant in 0012 for
  the same reason. Removing a line you mistyped should not leave a tombstone.
- The `sync_checklist_item_done` trigger returns from its INSERT branch before any reference to OLD.
  Migration 0016 exists because PL/pgSQL resolves every record field reference in an expression
  regardless of which branch would run, so `tg_op = 'INSERT' or old.is_done` would not have been
  safe however it reads.
- `attachAssignees` became `attachDetails` and now fetches assignees and checklist counts in one
  `Promise.all` for the whole page. Per-card queries would have been 1000 round trips for a full
  board.
- **Eight new RLS checks**, extending `verify:rls` in the same commit as the migration, as that
  script asks. They prove a member may read any checklist but only write on tasks assigned to them,
  that anon reads nothing, and that the completed stamps set and clear. All eight pass.
- **Three new schema checks.** `checklistItemSchema` trims before testing for emptiness, which is
  exactly the shape that caused the "check the details below" bug, so it is now covered by
  `verify:schemas`. 23/23 idempotent.
- Verified end to end against a signed-in user rather than by reading the diff: a task with two of
  four items ticked renders a bar at exactly 50% with the right `progressbar` labelling, the detail
  panel reads "Subtasks (1/2)", and a member who is *not* assigned sees the checklist read-only with
  no add field and no remove buttons.

**Known issue:** `verify:rls` must be run as the workspace's only active super admin. Its fourth
check demotes the runner to prove the last-super-admin guard fires; with a second super admin present
the guard correctly permits it, the runner is left a member, and ten later manager-gated checks fail
as a consequence. That is the suite mis-reporting, not the boundary failing.

**Files touched:** `supabase/migrations/0018_task_checklist.sql`,
`src/features/tasks/{schema,queries,actions}.ts`,
`src/features/tasks/components/{task-board,task-checklist}.tsx`,
`src/app/(app)/tasks/[id]/page.tsx`, `scripts/{verify-rls.mjs,verify-schemas.ts}`

**Migration:** 0018_task_checklist.sql — applied


### 2026-09-25 — Tasks: Kanban by default, on the reference design

**Changed**

- **The board is now the default view.** `/tasks` with no query string opens Kanban; List is still one
  click away and unchanged. Changed in two places that have to agree — the `view` default in
  `taskFiltersSchema` (server) and the fallback in `task-filters.tsx` (client). Changing only one
  would have made the toggle render "List" as active while the server drew a board.
- **Columns are tinted by meaning**, faintly, with a full-strength dot of the same hue in the
  heading: To do grey, In progress blue, In review purple, Blocked red, Done green. Five quiet tints
  side by side still read as one surface; the dot is what makes a column identifiable at that
  weight. Count sits beside the heading in parentheses, with a `+` on the right.
- **Cards follow the reference**: priority pill top-left, overflow menu top-right, title on two
  lines, then a footer splitting the due date (with a calendar icon) from the assignee chips.
  Priority uses the shared pill — Urgent red, High amber, Medium purple, Low blue.
- **Assignees are an overlapping chip stack**, three then `+n`. The old card named only the first
  assignee and silently hid the rest.
- **The whole card is the link** and the visible drag grip is gone; the card itself is the handle,
  as in the reference.
- **Columns keep their width and scroll sideways** instead of compressing. The old board packed five
  columns into a grid, which at laptop width gave each one less room than the card inside it.

**Notes:**

- Drag and drop is untouched: same HTML5 handlers, same optimistic local copy, same `midpoint`
  positioning, same rollback when the server refuses, same rule that non-managers may only move what
  is assigned to them. This was a restyle, not a rewrite.
- The overflow menu gives the board Edit and Delete, which it never had — `TaskActions` was only
  wired into the list.
- **No progress bar.** The reference's cards show a "Progress 10%" bar and there is no progress data
  in the schema: no column on `tasks`, no checklist or subtask table. Deriving a percentage from
  status would have drawn a bar that reads 50% for every in-progress task regardless of how much is
  actually done, which is decoration impersonating data. Left out pending a decision on whether to
  add a real column.
- The reference's top tab strip (Kanban / List / Files / Dashboard / Setting) was not adopted: this
  app navigates by sidebar and breadcrumb, and three of those tabs have no equivalent here. The
  existing List/Board toggle still does that job.
- Verified against the running dev server as a signed-in user: `/tasks` returns 200 and renders all
  five columns with no list table, and `/tasks?view=list` still renders the table with no board.

**Files touched:** `src/features/tasks/components/{task-board,task-filters}.tsx`,
`src/features/tasks/schema.ts`

**Migration:** none


### 2026-09-25 — Projects as a card grid

**Changed**

Projects left the table and became a grid of cards, on the supplied file-manager reference. The
shape fits: a project *is* a container — websites, credentials, files — so it should read like a
folder rather than a row.

- **Card anatomy**, following the reference: a tinted icon tile top-left, an overflow menu
  top-right, the name, then the client, then a footer splitting state from ownership.
- **The icon tile is tinted by status**, the way the reference tints by file type. Planning grey,
  Active blue, On hold amber, Completed green, Cancelled red.
- **The whole card is the link**, via an overlay pseudo-element, so a card opens as easily as a
  folder does. The overflow menu is lifted above it so its clicks still land.
- **Owner becomes an initials chip** in the corner, as in the reference. Profiles have no avatar
  images, and the reference uses lettered chips for exactly that case.
- **Brand is a coloured dot** before the client name rather than its own column.
- Due date sits under the status pill and turns red only while the work is still live. A completed
  project with a past due date is finished, not late.

**Added**

- `src/features/projects/components/project-card-actions.tsx` — the card's overflow menu, with Edit
  and a confirmed Delete.
- `TONE_CLASSES` is now exported from `pill.tsx`, so the icon tiles tint from the same palette
  instead of repeating the hex values.

**Fixed**

- **`setProjectDeleted` had no caller.** It has existed since Phase 3 with passing RLS tests and no
  way to reach it from the interface — the projects table had no actions column at all. This is the
  third time a working action shipped with no button (files, then tasks, now projects); the tests
  prove the action is *safe*, never that it is *reachable*.

**Notes:**

- Grid is 1/2/3/4 columns by breakpoint. Filters and pagination are untouched.
- Verified by rendering `/projects` against the production build as a signed-in user: 200, the grid,
  the card shell, the pills and the due line are all in the HTML. Also confirmed `size-4.5` and
  `line-clamp-2` actually compiled into the stylesheet — an uncompiled size class would have left
  the folder icons at lucide's 24px default and nothing would have failed loudly.
- **Two deliberate departures from the reference.** Its hover state inverts the card to dark navy;
  across a grid of twelve that flashes a dark block under the cursor, so hover is a shadow lift
  instead. Its two-tier "Recently opened / Files" grouping was skipped because grouping would fight
  the existing status filter and break across pagination. Both are easy to add if wanted.
- **Still to restyle:** Tasks and Pipeline lists, the detail pages, and the auth screens.

**Files touched:** `src/features/projects/components/{projects-grid,project-card-actions}.tsx`
(replacing `projects-table.tsx`), `src/app/(app)/projects/page.tsx`, `src/components/common/pill.tsx`

**Migration:** none


### 2026-09-25 — Contacts as a Notion database table

**Changed**

The contacts list was a shadcn table sitting on a page. It is now a database grid, which is the
shape the reference actually has.

- **A grid, not stripes.** Hairlines run in both directions. Notion's tables read as a spreadsheet
  because the columns are divided, not because the rows are banded.
- **Headers recede behind their property type.** Each column heading is a muted 12px label after a
  small icon standing for what the column holds — text, select, email, person, date, multi-select.
  The icon is what makes the heading scannable at that weight.
- **The first column is the title property**: the only bold cell and the only row link, underlined
  on hover, with the job title tucked under it in small muted text.
- **Status and Type became pills.** Soft pastel chips on the Notion palette, with a leading dot on
  Status because it is a state rather than a label. Lead reads blue, Active green, Inactive and
  Archived grey; Person purple, Company amber.
- **Row actions stay invisible** until the row is hovered or focused, so the grid reads as data
  instead of as a column of buttons.
- Empty cells render an em dash rather than nothing, so a sparse row still reads as a row.

**Added**

- `src/components/common/pill.tsx` — the pastel chip, seven tones, optional leading dot, with dark
  mode values for each. Shared, because Projects, Tasks and Pipeline all need the same chip next.

**Notes:**

- Columns drop out by breakpoint rather than scrolling on a laptop: Type at `sm`, Email at `md`,
  Phone and Brand at `lg`, Owner and Tags at `xl`. Name and Status are always present, since a row
  you cannot identify or triage is not worth showing.
- Tags show two and then a `+n` count. A row whose tag list wraps to three lines destroys the grid.
- Labels come from `TYPE_LABELS` and `STATUS_LABELS` in the module schema rather than being typed
  into the component again. `contact.status` is a plain string in the generated types, so its lookup
  falls back to the raw value; `contact.type` is a union and does not need to.
- Verified by rendering `/contacts` against the production build as a signed-in user, not by
  reading the diff: 200, the grid, the hairlines, the pills and the headers are all in the HTML.
- Ran `prettier` on the two files in this change. The repo has no prettier config, so this was a
  one-off on files written this session and nothing pre-existing was reformatted.
- **Still to restyle:** Projects, Tasks and Pipeline lists, the detail pages, and the auth screens.

**Files touched:** `src/features/contacts/components/contacts-table.tsx`,
`src/components/common/pill.tsx`

**Migration:** none


### 2026-09-25 — Notion-style UI, first pass

**Changed**

Reworked the shell and the dashboard against the supplied reference. Structural, not decorative:
the parts that change how the app reads.

- **Warm neutrals.** Every colour token carried zero chroma, which is what made the UI read cold
  and generic. They now carry a little chroma at a yellow hue: `#2d2b27` text on white, a `#f8f7f4`
  sidebar, `#e7e6e4` hairlines. Notion's calm comes from warmth at low contrast, not from grey.
- **Sidebar**: an off-white panel against the white page, quiet 8px rows, section labels, and live
  counts on the right of Contacts, Pipeline, Projects and Tasks. The active row is the only white
  surface in the panel, which is what makes it read as selected without needing a colour.
- **Breadcrumb**, derived from the URL so every route gets one for free. Ids are dropped —
  `/contacts/9f3e…/edit` reads as Contacts › Edit.
- **Topbar** is now a thin, borderless strip. A rule across it cut the page in two for no reason.
- **Page titles** are larger and tighter, with a muted line under them and no divider. Separation
  comes from space.
- **Cards** use a hairline border rather than a ring, with more room inside and smaller, heavier
  titles.
- **Table** headers recede to muted 12px; rows lose the final border, since the card already ends.
- **Dashboard** rebuilt to the reference's shape: one inline stat strip instead of five cards, a
  single amber callout for the most pressing thing, then a 3/2 split of tasks and pipeline, with
  activity below.
- Content is capped at a readable column width instead of running the full monitor.

**Notes:**

- The greeting follows the clock. "Good morning" at 9pm is the kind of detail that makes software
  feel unattended.
- The callout shows **one** item, chosen as the most overdue project or else the next task due, and
  renders nothing when the day is clear. A list of five priorities is not a priority list, and an
  empty callout is noise with a border.
- The sidebar search box is present but disabled and labelled, because global search is still
  unbuilt. A box that swallows what you type is worse than one that says it is not ready.
- Verified that all eight routes still render and that the tokens compile to warm values — the
  build converts oklch to hex, so the check asserts red exceeds blue rather than matching syntax.
- **Not yet restyled:** the list and detail pages still use the old density, and the auth pages are
  untouched. This pass covered the shell, the tokens and the dashboard.

**Files touched:** `src/app/globals.css`, `src/components/layout/**`, `src/components/ui/{card,table}.tsx`,
`src/app/(app)/{layout,dashboard/page}.tsx`, `src/features/dashboard/components/**`

**Migration:** none


### 2026-09-25 — Manrope, and a font that was never actually applied

**Changed**

- Manrope is now the only typeface the app loads, self-hosted by `next/font`.

**Fixed**

- **The previous font was downloaded on every page load and never rendered.** `globals.css` defined
  `--font-sans: var(--font-sans)` — a variable pointing at itself, which resolves to nothing —
  while the layout exposed `--font-geist-sans`, a name nothing read. So Geist Sans and Geist Mono
  were both fetched and both ignored, and the UI rendered in the browser's default system font the
  whole time. Switching to Manrope is therefore a visible change, not a subtle one.

**Notes:**

- `--font-mono` is deliberately **not** Manrope. Manrope has no monospace cut, and the places using
  `font-mono` are the ones where character shape matters most: a revealed credential password, a
  username, a project code. It falls back to the system monospace stack, which downloads nothing.
- Verified against the served stylesheet rather than the source: the `html` rule carries
  `var(--font-manrope)`, the variable is defined on the element, headings match, `font-mono` is
  still a monospace stack, and exactly one font file is served.

**Files touched:** `src/app/layout.tsx`, `src/app/globals.css`

**Migration:** none


### 2026-09-25 — Phase 7 begins: CSV import for contacts

**Added**

- `/contacts/import`: upload a CSV, correct the guessed column mapping, preview without saving,
  then import. Reached from an Import button beside New contact.
- `features/contacts/import/`: `csv.ts` (parser and mapping), `actions.ts`, `components/`.
- Column guessing from real-world header names — "First Name", "E-mail", "Client Email Address",
  "Mobile", "Zip Code" and so on — with every guess shown and correctable before anything is
  written.
- A dry run that reports exactly what would happen, row by row, and writes nothing.
- Per-import defaults for owner, brand, and status, applied to every row.

**Deduplication is on email**, case-insensitively, resolving open question 2 in section 14. Chosen
by the owner on 2026-09-25.

**Notes:**

- **Section 8.2 is satisfied literally:** the import validates through the same `contactSchema` the
  manual form uses, so a row the form would reject is rejected here too. It has no separate idea of
  what a valid contact is.
- **No CSV library.** The awkward part of the format is quoted fields containing commas and
  newlines, and that is about thirty lines. Verified against a file with a quoted comma, an
  embedded newline, a doubled quote, and a UTF-8 BOM — the last of which Excel writes and which
  otherwise becomes part of the first header name and stops it matching anything.
- **Rows with no email cannot be deduplicated**, which is inherent to the rule chosen: nothing
  identifies them. Re-importing the same file creates them again. The wizard now counts those rows
  and says so, on both the preview and the result, so it is a known trade-off rather than a
  surprise found later. Verified: re-importing a six-row file updated the three with emails and
  created the one without.
- Duplicates *within* one file are collapsed too, not just against existing contacts.
- Inserts go in batches of 200. One statement per row would be thousands of round trips to Seoul;
  one statement for everything would let a single bad row lose the whole import.
- Capped at 5,000 rows per import, and at 200 reported rows, so a large file does not return a
  larger report than the data.

**Files touched:** `src/features/contacts/import/**`, `src/app/(app)/contacts/import/page.tsx`,
`src/app/(app)/contacts/page.tsx`

**Migration:** none


### 2026-09-25 — Performance: pages were taking seconds

**Fixed**

Reported from real use. Measured before touching anything, on production: `/dashboard` 3.4–4.0s,
`/tasks` 2.3s, and `/api/health` — which touches no database at all — 880ms. Two structural causes.

- **Vercel functions ran in `sin1` (Singapore) while Supabase is in `ap-northeast-2` (Seoul)**, so
  every query crossed that gap. `vercel.json` pins the functions to `icn1`. Confirmed by the
  response header `X-Vercel-Id: sin1::icn1::…`, whose second segment is the execution region.
- **`requireUser()` ran twice per page** — once in the `(app)` layout, once in the page inside it —
  and each call made its own `getUser()` round trip, its own `profiles` select, and its own
  `touch_last_seen` RPC. Seven sequential calls to Seoul before a page began fetching its own data.
  `getCurrentUser` is now wrapped in React `cache()`.
- `touch_last_seen` was a round trip on every load even though the database throttles the write to
  once per five minutes. The profile already says when it last happened, so the call is skipped
  unless it would write something.
- The same per-request memo now covers the option lists a layout and its page both read: brands,
  assignable users, contacts, projects, pipelines, stages, and workspace settings.

**Result:** 1.7–4.0s per page before, ~450–620ms steady state after, with a ~1.5s worst cold start.
Measured the same way both times.

**Files touched:** `vercel.json`, `src/lib/auth.ts`,
`src/features/{brands,users,contacts,projects,pipeline}/queries.ts`

**Migration:** none

**Notes:**

- `cache()` is a **per-request** memo, not a cross-request cache. A suspended user is still denied
  on their very next navigation, and RLS is unaffected.
- A first measurement appeared to show 76–95ms pages. That was wrong: it took the minimum of three
  runs against a warm lambda. Re-measured with cold and warm separated, and asserting the response
  actually contained the page — a 307 redirect is fast too.
- What remains is about two auth round trips per request, one in the proxy and one in the page. The
  project uses legacy HS256 tokens, so `getClaims()` cannot verify locally and would not help.
  Migrating the project to asymmetric JWT signing keys would remove both, and is the next
  meaningful step if 500ms is still too slow.

### 2026-09-25 — Backups, and a credential key that could be read silently

**Added**

- `npm run backup`: a logical backup of every table, the auth user list, a storage inventory, and
  the credential encryption key, into `backups/<timestamp>/`. `backups/` is gitignored.
- `RESTORE.md`: what a backup holds, what it does not, and how to restore into the same project or
  a new one — including the two triggers that fire during a load and produce noise.

**Security**

- **Migration `0017` revokes `credential_key()` from `service_role`.** `0006` revoked it from
  public, anon and authenticated, which covered every route an application user can take, but not
  the service role — which has elevated privileges in Supabase and sits in Vercel's environment and
  in `.env.local`. Anyone holding that key could decrypt a credential directly and leave no row in
  `credential_access_log`.

  That made a claim in the Phase 3 notes wrong: "a reveal that succeeds is always a reveal that was
  recorded" held for users and not for a leaked service-role key. It holds now. The security definer
  functions are unaffected — they run as their owner, so `reveal_credential` still decrypts and
  still logs first. Verified both directions.

**Fixed**

- An earlier entry called `activity_log` "the fourth and last shared subsystem". It is the third;
  `comments` is still unbuilt.

**Files touched:** `supabase/migrations/0017_lock_credential_key.sql`, `scripts/backup.mjs`,
`RESTORE.md`, `package.json`, `.gitignore`

**Migration:** `0017_lock_credential_key.sql`, applied to `wjtokyywsuummyaumyty`.

**Notes:**

- Neither `pg_dump` nor Docker is installed on the dev machine, so `supabase db dump` cannot run.
  The script uses Node and the service role instead, which is what is actually available.
- **The backup contains the key that decrypts every stored client password.** That is deliberate:
  without it those rows are unrecoverable by anyone. It also means the output is exactly as
  sensitive as the passwords themselves.
- Because `0017` revoked the key from the service role, the backup reads it through the Management
  API, which runs as `postgres` and needs `SUPABASE_ACCESS_TOKEN` — a different credential from the
  one the app runs on.
- The schema is deliberately not in the backup. It is in `supabase/migrations`, in git.
- Nothing schedules this. It is a manual weekly job until someone sets a reminder.

### 2026-09-25 — Phase 6, Dashboard

**Added**

- Migration `0014_activity_log.sql`: `activity_log`, the **third** of the four shared subsystems in
  section 5.6 — `comments` is still unbuilt, and an earlier draft of this entry wrongly called this
  the last one — written by one generic trigger attached to contacts, projects, tasks, and deals.
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
| 2026-09-25 | Contacts deduplicate on email alone, case-insensitively | Open question 2 in §14, decided by the owner. Simple and predictable; a row with no email is always created, because nothing identifies it. The cost is that re-importing a list duplicates its emailless rows, so the wizard counts them and says so rather than letting it be discovered later. |
| 2026-09-25 | CSV parsed by hand, no library | The one hard part of the format is quoted fields containing commas and newlines, and that is thirty lines. A dependency would be larger than the problem it solves. |
| 2026-09-25 | The importer validates through the same schema as the manual form | §8.2 requires it. Two definitions of a valid contact would diverge on the first change to either. |
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
| 2026-09-24 | No SMTP. The email-invite path is written but has never been executed, and password-reset-by-email does not exist. Temporary passwords cover both. **Deferred by the owner on 2026-09-25**; revisit when inviting people outside the Supabase org. | Low | Deferred, not blocking |
| 2026-09-25 | A backup holds the credential encryption key in plaintext, by necessity — without it the encrypted rows are unrecoverable. The output is as sensitive as the passwords it protects, and `backups/` is gitignored. | Medium | Open by design, documented in RESTORE.md |
| 2026-09-25 | Nothing schedules `npm run backup`. It is a manual weekly job until someone sets a reminder or a cron. | Medium | Open |
| 2026-09-25 | Storage file *contents* are not backed up, only an inventory. Re-uploading is manual. | Low | Open |
| 2026-09-24 | No backups configured. §10 calls this the one gap that can actually hurt.                                                                                      | Medium   | Fixed 2026-09-25, `npm run backup`      |
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

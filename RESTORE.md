# Restoring from a backup

`npm run backup` writes a folder to `backups/<timestamp>/`. This is how you get
it back.

Read this **before** you need it. The worst time to learn a restore procedure is
during the incident it was written for.

---

## What a backup holds, and what it does not

| In the backup                               | Not in the backup                          |
| ------------------------------------------- | ------------------------------------------ |
| Every row of every application table, as JSON | The schema — it lives in `supabase/migrations`, in git |
| The auth users list, with ids and emails    | Password hashes. Everyone resets after a restore into a new project |
| The credential encryption key               | The bytes of uploaded files — only an inventory of what existed |
| An inventory of stored files                | Anything created after the backup ran      |

**`CREDENTIAL_KEY.txt` is the most important file in there.** It decrypts
`credentials.secret_encrypted`. Without it those rows are permanently
unreadable — by anyone, including you. Migration `0017` deliberately made the
service-role key insufficient to read it, so the only routes to it are the
Management API and this backup.

Keep a backup wherever you would keep the client passwords themselves. It is not
an ordinary file.

---

## Restoring into the same project

For an accidental delete, this is almost always the answer, and it is a much
smaller job than a full restore.

Soft deletes mean most "lost" records are not gone. Before restoring anything:

```sql
-- The record is probably still there with deleted_at set.
update public.contacts set deleted_at = null where id = '...';
```

Only reach for the backup when a row was hard deleted or the data is genuinely
wrong.

---

## Restoring into a new project

1. **Create the project** and put its keys in `.env.local`, as in the original
   setup.

2. **Run the migrations**, which recreate the entire schema, every policy, and
   every trigger:

   ```bash
   npm run db:push
   ```

   Do **not** run `seed.sql`. The backup already contains the workspace and the
   brands, and seeding first would create duplicates.

3. **Restore the encryption key before any credential rows.** The key that
   migration `0006` generates on a fresh project is a *different* key, and
   credentials encrypted with the old one will not decrypt with it.

   Through the Supabase SQL editor:

   ```sql
   select vault.update_secret(
     (select id from vault.secrets where name = 'credential_encryption_key'),
     '<paste the contents of CREDENTIAL_KEY.txt>'
   );
   ```

4. **Recreate the auth users.** `auth_users.json` has the ids and emails. Ids
   matter: `profiles.id` references them, and every `created_by` and `owner_id`
   points at a profile. Use `scripts/bootstrap-admin.mjs` as a model — it uses
   `auth.admin.createUser`, which accepts an explicit `id`.

   Everyone sets a new password. Passwords are not in the backup by design.

5. **Load the tables in the order `manifest.json` lists them.** That order is
   parent-before-child, so foreign keys hold at every step. Loading
   `contacts.json` before `workspaces.json` will fail, and the failure is the
   point — it means the order was wrong, not that the data is bad.

   Insert with the **service role**, which bypasses RLS. A restore is not a user
   action and should not be filtered as one.

   Two triggers will fire and produce noise you should expect:
   - `log_activity` writes a fresh `activity_log` row for every insert. The
     restored `activity_log.json` is the real history; the new rows are an
     artifact of the restore.
   - `record_deal_stage_change` writes a `deal_stage_history` row per deal.
     Same story.

   If that matters, disable the triggers for the load:

   ```sql
   alter table public.deals disable trigger deals_record_stage_change;
   -- ... load ...
   alter table public.deals enable trigger deals_record_stage_change;
   ```

6. **Re-upload files.** `storage_inventory.json` tells you what existed and where.
   The bytes are not in the backup, so anything not held elsewhere is gone. The
   `attachments` rows will point at objects that do not exist until you do.

7. **Verify** before trusting it:

   ```bash
   CHECK_EMAIL=... CHECK_PASSWORD=... npm run verify:rls
   ```

   84 checks. They exercise the policies against real rows, which is a far better
   test of a restore than eyeballing a table.

---

## How often

Weekly is enough at this size, and worth a calendar reminder — nothing here runs
it for you. Run it before anything risky, too: a schema change, a bulk import, a
migration you are unsure about.

```bash
npm run backup                    # into ./backups
npm run backup -- --out D:/drive  # or somewhere that syncs off this machine
```

A backup on the same disk as the thing it protects is half a backup. Put it
somewhere that leaves the machine.

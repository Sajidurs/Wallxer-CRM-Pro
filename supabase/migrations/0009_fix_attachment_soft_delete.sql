-- 0009_fix_attachment_soft_delete.sql
--
-- Fixes a bug in 0008: deleting a file failed with
--   new row violates row-level security policy for table "attachments"
--
-- PostgreSQL requires the row produced by an UPDATE to still satisfy the
-- SELECT policy. The policy from 0008 was
--
--   workspace_id = auth_workspace_id() and deleted_at is null
--
-- so the moment deleted_at was set, the new row became invisible under it and
-- the update was rejected. Soft delete was impossible for every user.
--
-- `contacts` and `projects` never hit this because their SELECT policies end in
-- `or is_manager()`, which keeps the deleted row visible to whoever is allowed
-- to delete it. Attachments needs the same escape, plus the uploader — the
-- guard trigger in 0008 deliberately lets people remove files they uploaded
-- themselves, and that permission is worthless if the policy blocks the write.
--
-- Forward only. Never edit once applied.

drop policy "attachments_select_own_workspace" on public.attachments;

create policy "attachments_select_own_workspace" on public.attachments
  for select to authenticated
  using (
    workspace_id = public.auth_workspace_id()
    and (
      deleted_at is null
      or public.is_manager()
      or created_by = auth.uid()
    )
  );

-- Note for anyone adding a soft-deletable table later: the rule is that whoever
-- may set deleted_at must still be able to SELECT the row afterwards. Queries
-- continue to filter `deleted_at is null` explicitly, so this widens nothing in
-- the UI — every list still shows only live rows.

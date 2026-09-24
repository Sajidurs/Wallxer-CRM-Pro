-- 0010_attachment_authorship.sql
--
-- The guard in 0008 lets someone remove a file they uploaded, judged by
-- `created_by`. Nothing stopped a client from setting that column to whatever
-- it liked on insert, so the permission rested on a field the user controlled:
-- claim someone else's identity and the file looks like theirs, or claim your
-- own on a row you did not upload and you can delete it.
--
-- The upload route always sets it correctly. This closes the direct-PostgREST
-- path, which is the one that matters — the route is a convenience, the policy
-- is the boundary.
--
-- Forward only. Never edit once applied.

drop policy "attachments_insert_own_workspace" on public.attachments;

create policy "attachments_insert_own_workspace" on public.attachments
  for insert to authenticated
  with check (
    workspace_id = public.auth_workspace_id()
    -- Null is allowed so a future server-side importer can leave it unset;
    -- what is refused is claiming to be someone else.
    and (created_by is null or created_by = auth.uid())
  );

-- Authorship is set once, at upload. Rewriting it would transfer the right to
-- delete the file, which is exactly what the guard is meant to pin down.
create or replace function public.guard_attachment_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (old.deleted_at is null) <> (new.deleted_at is null) then
    if not public.is_manager() and old.created_by is distinct from auth.uid() then
      raise exception 'You can only remove files you uploaded';
    end if;
  end if;

  if new.workspace_id is distinct from old.workspace_id
     or new.storage_path is distinct from old.storage_path
     or new.bucket is distinct from old.bucket
  then
    raise exception 'An attachment cannot be repointed at a different file';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'Who uploaded a file cannot be changed';
  end if;

  return new;
end;
$$;

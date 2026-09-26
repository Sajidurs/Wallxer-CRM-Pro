-- 0022_avatar_cleanup.sql
-- Lets a replaced profile photo actually go away.
--
-- 0008 created the `avatars` bucket with select, insert and update policies but
-- no delete. Replacing a photo would therefore leave the old object in storage
-- for ever: nothing references it, nothing can remove it, and the workspace's
-- storage quota only ever goes up. Not urgent at three users; permanent if left.
--
-- Avatar paths are {workspace_id}/{user_id}/{uuid}.{ext}, so segment 1 is the
-- workspace and segment 2 is the owner. That second segment is what makes
-- "your own photo" expressible in a policy at all.
--
-- Forward only. Never edit once applied.

create policy "avatars_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.auth_workspace_id()::text
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or public.is_admin()
    )
  );

comment on column public.profiles.avatar_url is
  'Storage object path inside the private `avatars` bucket, NOT a URL. The '
  'bucket is private per SYSTEM_DESIGN 7.4, so this is signed on read rather '
  'than linked to directly. The column name predates the decision.';

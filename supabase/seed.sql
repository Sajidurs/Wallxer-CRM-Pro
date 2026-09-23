-- seed.sql
-- The one workspace and the five brands. Safe to run more than once.
--
-- This must run BEFORE the first user is invited: handle_new_user needs a
-- workspace to attach the new profile to.
--
-- The first super admin is not created here, because a profile needs a matching
-- auth.users row and that is not something SQL should be forging by hand. Run
-- `npm run bootstrap:admin` instead, which creates the auth user through the
-- Supabase Admin API and promotes the profile the trigger made.

insert into public.workspaces (name, slug, settings)
values (
  'Agency',
  'agency',
  jsonb_build_object(
    -- Deal amounts exist in the schema but stay out of the UI until this flips.
    'pipeline', jsonb_build_object('show_values', false)
  )
)
on conflict (slug) do nothing;

insert into public.brands (workspace_id, name, color, position)
select w.id, seed.name, seed.color, seed.position
from public.workspaces w
cross join (
  values
    ('Boost',         '#2563eb', 1),
    ('Falah Chat',    '#16a34a', 2),
    ('Aim Locksmith', '#ea580c', 3),
    ('Wallxer',       '#7c3aed', 4),
    ('Elever Notes',  '#0891b2', 5)
) as seed(name, color, position)
where w.slug = 'agency'
on conflict (workspace_id, lower(name)) do nothing;

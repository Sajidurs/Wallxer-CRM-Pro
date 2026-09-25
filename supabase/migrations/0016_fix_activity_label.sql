-- 0016_fix_activity_label.sql
--
-- Fixes a bug in 0014 that broke creating and editing records on every table
-- the trigger was attached to:
--
--   ERROR 42703: record "v_row" has no field "first_name"   (on projects)
--   ERROR 42703: record "v_row" has no field "name"         (on contacts)
--
-- The label was chosen with a CASE over tg_table_name that referenced
-- v_row.first_name, v_row.name and v_row.title in different branches. SQL CASE
-- evaluates lazily, but PL/pgSQL does not work that way: it rewrites the whole
-- expression into a SQL query and resolves *every* record field reference in it
-- as a parameter, whichever branch would actually run. A field that does not
-- exist on the triggering table therefore raises, always.
--
-- to_jsonb(v_row) ->> 'field' asks the row for a key instead of a column, and
-- returns null when it is absent. One shape that works for every table, which
-- is what a generic trigger needs.
--
-- Forward only. Never edit once applied.

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity  text;
  v_action  text;
  v_label   text;
  v_changes jsonb := '{}'::jsonb;
  v_row     jsonb;
  v_old     jsonb;
begin
  v_row := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;

  v_entity := case tg_table_name
    when 'contacts' then 'contact'
    when 'projects' then 'project'
    when 'tasks'    then 'task'
    when 'deals'    then 'deal'
    else tg_table_name
  end;

  -- Asked of the row as a json object, so a key the table does not have is
  -- simply null rather than an error.
  v_label := coalesce(
    nullif(
      trim(
        coalesce(v_row ->> 'first_name', '') || ' ' || coalesce(v_row ->> 'last_name', '')
      ),
      ''
    ),
    v_row ->> 'company_name',
    v_row ->> 'name',
    v_row ->> 'title',
    'a record'
  );

  if tg_op = 'INSERT' then
    v_action := 'created';
  elsif tg_op = 'UPDATE' then
    if (v_old ->> 'deleted_at') is null and (v_row ->> 'deleted_at') is not null then
      v_action := 'deleted';
    elsif (v_old ->> 'deleted_at') is not null and (v_row ->> 'deleted_at') is null then
      v_action := 'restored';
    elsif (v_old ->> 'status') is distinct from (v_row ->> 'status') then
      v_action := 'status_changed';
      v_changes := jsonb_build_object(
        'from', v_old ->> 'status',
        'to',   v_row ->> 'status'
      );
    else
      v_action := 'updated';
    end if;
  else
    v_action := 'deleted';
  end if;

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, action, changes)
  values (
    (v_row ->> 'workspace_id')::uuid,
    auth.uid(),
    v_entity,
    (v_row ->> 'id')::uuid,
    v_action,
    v_changes || jsonb_build_object('label', v_label)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

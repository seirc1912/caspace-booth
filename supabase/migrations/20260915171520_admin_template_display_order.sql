-- Reuse templates.display_order as a contiguous, one-based position per room.
-- Existing template order is preserved by the same display_order/created_at ordering
-- previously used by the Admin and customer catalog functions.

with ranked as (
  select id,
    row_number() over (partition by room_id order by display_order, created_at, id)::integer as next_display_order
  from public.templates
)
update public.templates template
set display_order = ranked.next_display_order
from ranked
where template.id = ranked.id
  and template.display_order is distinct from ranked.next_display_order;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.templates'::regclass
      and conname = 'templates_room_display_order_key'
  ) then
    alter table public.templates
      add constraint templates_room_display_order_key
      unique (room_id, display_order)
      deferrable initially immediate;
  end if;
end;
$$;

create or replace function public.admin_upsert_template(p_token uuid, p_template jsonb)
returns public.templates
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  result public.templates;
  existing public.templates;
  next_room_id text := p_template->>'room_id';
  next_display_order integer;
begin
  if not private.valid_admin_session(p_token) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if next_room_id is null then raise exception 'Template room is required' using errcode = '22023'; end if;

  select * into existing from public.templates where id = p_template->>'id';
  perform pg_advisory_xact_lock(hashtextextended(least(coalesce(existing.room_id, next_room_id), next_room_id), 0));
  if existing.id is not null and existing.room_id <> next_room_id then
    perform pg_advisory_xact_lock(hashtextextended(greatest(existing.room_id, next_room_id), 0));
  end if;
  set constraints templates_room_display_order_key deferred;
  if existing.id is not null then
    select * into existing from public.templates where id = existing.id for update;
  end if;

  if existing.id is null then
    select coalesce(max(display_order), 0) + 1 into next_display_order
    from public.templates where room_id = next_room_id;
    insert into public.templates (id, room_id, name, thumbnail, editor_data, enabled, display_order)
    values (
      p_template->>'id', next_room_id, p_template->>'name', nullif(p_template->>'thumbnail', ''),
      p_template->'editor_data', coalesce((p_template->>'enabled')::boolean, false), next_display_order
    ) returning * into result;
  elsif existing.room_id = next_room_id then
    update public.templates set
      name = p_template->>'name', thumbnail = nullif(p_template->>'thumbnail', ''),
      editor_data = p_template->'editor_data', enabled = coalesce((p_template->>'enabled')::boolean, false)
    where id = existing.id returning * into result;
  else
    update public.templates
    set display_order = display_order - 1
    where room_id = existing.room_id and display_order > existing.display_order;
    select coalesce(max(display_order), 0) + 1 into next_display_order
    from public.templates where room_id = next_room_id;
    update public.templates set
      room_id = next_room_id, name = p_template->>'name', thumbnail = nullif(p_template->>'thumbnail', ''),
      editor_data = p_template->'editor_data', enabled = coalesce((p_template->>'enabled')::boolean, false),
      display_order = next_display_order
    where id = existing.id returning * into result;
  end if;
  return result;
end;
$$;

create or replace function public.admin_delete_template(p_token uuid, p_id text)
returns void
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  target public.templates;
begin
  if not private.valid_admin_session(p_token) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  select * into target from public.templates where id = p_id;
  if target.id is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(target.room_id, 0));
  select * into target from public.templates where id = p_id for update;
  if target.id is null then return; end if;
  set constraints templates_room_display_order_key deferred;
  delete from public.templates where id = target.id;
  update public.templates
  set display_order = display_order - 1
  where room_id = target.room_id and display_order > target.display_order;
end;
$$;

create or replace function public.admin_reorder_template(p_token uuid, p_id text, p_position integer)
returns void
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  target public.templates;
  template_count integer;
  next_position integer;
begin
  if not private.valid_admin_session(p_token) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if p_position is null or p_position < 1 then raise exception 'Position must be a positive integer' using errcode = '22023'; end if;

  select * into target from public.templates where id = p_id;
  if target.id is null then raise exception 'Template not found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target.room_id, 0));
  select * into target from public.templates where id = p_id for update;
  select count(*) into template_count from public.templates where room_id = target.room_id;
  next_position := least(p_position, template_count);
  if next_position = target.display_order then return; end if;

  set constraints templates_room_display_order_key deferred;
  if next_position < target.display_order then
    update public.templates
    set display_order = display_order + 1
    where room_id = target.room_id
      and display_order >= next_position
      and display_order < target.display_order;
  else
    update public.templates
    set display_order = display_order - 1
    where room_id = target.room_id
      and display_order > target.display_order
      and display_order <= next_position;
  end if;
  update public.templates set display_order = next_position where id = target.id;
end;
$$;

create or replace function public.admin_templates_summary(p_token uuid)
returns table (
  id text, room_id text, name text, thumbnail text, enabled boolean,
  status text, category text, slot_count integer, display_order integer, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not private.valid_admin_session(p_token) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  return query
  select template.id, template.room_id, template.name, template.thumbnail, template.enabled,
    nullif(template.editor_data->>'status', ''),
    nullif(template.editor_data#>>'{info,category}', ''),
    coalesce(jsonb_array_length(coalesce(template.editor_data#>'{template,slots}', '[]'::jsonb)), 0),
    template.display_order, template.updated_at
  from public.templates template
  order by template.room_id, template.display_order, template.created_at, template.id;
end;
$$;

create or replace function public.published_templates_summary()
returns table (
  id text, room_id text, name text, thumbnail text, print_size text,
  slot_count integer, display_order integer
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select template.id, template.room_id, template.name, template.thumbnail,
    nullif(template.editor_data#>>'{info,printSize}', ''),
    coalesce(jsonb_array_length(coalesce(template.editor_data#>'{template,slots}', '[]'::jsonb)), 0),
    template.display_order
  from public.templates template
  join public.rooms room on room.id = template.room_id
  where template.enabled and room.enabled and room.published
  order by template.room_id, template.display_order, template.created_at, template.id;
$$;

revoke all on function public.admin_reorder_template(uuid, text, integer) from public, authenticated;
grant execute on function public.admin_reorder_template(uuid, text, integer) to anon;

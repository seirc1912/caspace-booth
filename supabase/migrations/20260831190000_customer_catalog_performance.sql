-- Additive public customer catalog APIs. No room, template, editor_data, or asset is modified.

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
  order by template.display_order, template.created_at;
$$;

create or replace function public.published_template_detail(p_id text)
returns public.templates
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare result public.templates;
begin
  select template.* into result
  from public.templates template
  join public.rooms room on room.id = template.room_id
  where template.id = p_id and template.enabled and room.enabled and room.published;
  if result.id is null then
    raise exception 'Published template not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

revoke all on function public.published_templates_summary() from public;
revoke all on function public.published_template_detail(text) from public;
grant execute on function public.published_templates_summary() to anon, authenticated;
grant execute on function public.published_template_detail(text) to anon, authenticated;

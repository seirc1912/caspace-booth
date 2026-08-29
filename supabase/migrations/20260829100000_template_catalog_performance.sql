-- Additive catalog performance APIs and template asset storage.
-- This migration does not update or delete any room, template, order, or object.

create function public.admin_templates_summary(p_token uuid)
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
  order by template.display_order, template.created_at;
end;
$$;

create function public.admin_template_detail(p_token uuid, p_id text)
returns public.templates
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
declare result public.templates;
begin
  if not private.valid_admin_session(p_token) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  select * into result from public.templates where id = p_id;
  if result.id is null then raise exception 'Template not found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

revoke all on function public.admin_templates_summary(uuid) from public, authenticated;
revoke all on function public.admin_template_detail(uuid, text) from public, authenticated;
grant execute on function public.admin_templates_summary(uuid) to anon;
grant execute on function public.admin_template_detail(uuid, text) to anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('template-assets', 'template-assets', true, 52428800, array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml'])
on conflict (id) do nothing;

create function private.valid_admin_asset_upload(p_metadata jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = private, pg_catalog
as $$
declare token uuid;
begin
  begin token := (p_metadata->>'adminToken')::uuid;
  exception when others then return false;
  end;
  return private.valid_admin_session(token);
end;
$$;

create policy "Admins can upload template assets" on storage.objects
for insert to anon
with check (bucket_id = 'template-assets' and private.valid_admin_asset_upload(user_metadata));

create policy "Template assets are public" on storage.objects
for select to anon, authenticated
using (bucket_id = 'template-assets');

-- Deliberately no UPDATE or DELETE object policy: uploads use unique paths and
-- existing production assets cannot be overwritten or removed by this client.

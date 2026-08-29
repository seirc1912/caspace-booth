-- Optional future support for scripts/migrate-template-base64-assets.mjs.
-- Applying this migration does not convert or otherwise modify any template.
-- Do not apply until the separate Base64 migration operation is authorized.

create function public.admin_replace_template_editor_data_if_unchanged(
  p_token uuid, p_id text, p_expected_updated_at timestamptz, p_editor_data jsonb
)
returns public.templates
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare result public.templates;
begin
  if not private.valid_admin_session(p_token) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  update public.templates
  set editor_data = p_editor_data
  where id = p_id and updated_at = p_expected_updated_at
  returning * into result;
  if result.id is null then raise exception 'Template changed during migration; no update applied' using errcode = '40001'; end if;
  return result;
end;
$$;

revoke all on function public.admin_replace_template_editor_data_if_unchanged(uuid, text, timestamptz, jsonb) from public, authenticated;
grant execute on function public.admin_replace_template_editor_data_if_unchanged(uuid, text, timestamptz, jsonb) to anon;

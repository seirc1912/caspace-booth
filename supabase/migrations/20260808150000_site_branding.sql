create table if not exists public.site_branding (
  singleton boolean primary key default true check (singleton),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);

insert into public.site_branding (singleton, settings) values (true, '{}'::jsonb) on conflict (singleton) do nothing;
alter table public.site_branding enable row level security;
revoke all on public.site_branding from anon, authenticated;

drop trigger if exists site_branding_set_updated_at on public.site_branding;
create trigger site_branding_set_updated_at before update on public.site_branding for each row execute function public.set_updated_at();

create or replace function public.site_branding()
returns jsonb language sql stable security definer set search_path = public, pg_catalog
as $$ select settings from public.site_branding where singleton = true; $$;

create or replace function public.admin_save_site_branding(p_token uuid, p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = public, private, pg_catalog
as $$
begin
  if not private.valid_admin_session(p_token) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if jsonb_typeof(p_settings) <> 'object' then raise exception 'Invalid branding settings' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_each_text(p_settings) item where item.key in ('websiteUrl','facebookUrl','instagramUrl','tiktokUrl','zaloUrl','logoUrl','faviconUrl','backgroundImageUrl') and item.value <> '' and item.value <> 'null' and item.value !~ '^https://') then
    raise exception 'Website and asset URLs must use HTTPS' using errcode = '22023';
  end if;
  insert into public.site_branding (singleton, settings) values (true, p_settings)
  on conflict (singleton) do update set settings = excluded.settings;
  return p_settings;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets', 'site-assets', true, 8388608, array['image/jpeg','image/png','image/webp','image/gif','image/x-icon'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.valid_site_asset_upload(p_name text, p_metadata jsonb)
returns boolean language plpgsql stable security definer set search_path = private, pg_catalog
as $$
declare token uuid;
begin
  if p_name !~ '^branding/(logo|favicon|background)-[0-9]+$' then return false; end if;
  begin token := (p_metadata->>'adminToken')::uuid; exception when others then return false; end;
  return private.valid_admin_session(token);
end;
$$;

drop policy if exists "Public can read site assets" on storage.objects;
create policy "Public can read site assets" on storage.objects for select to anon using (bucket_id = 'site-assets');
drop policy if exists "Admin can upload site assets" on storage.objects;
create policy "Admin can upload site assets" on storage.objects for insert to anon with check (bucket_id = 'site-assets' and private.valid_site_asset_upload(name, user_metadata));
drop policy if exists "Admin can replace site assets" on storage.objects;
create policy "Admin can replace site assets" on storage.objects for update to anon using (bucket_id = 'site-assets') with check (bucket_id = 'site-assets' and private.valid_site_asset_upload(name, user_metadata));
drop policy if exists "Admin can remove site assets" on storage.objects;

revoke all on function public.site_branding() from public;
revoke all on function public.admin_save_site_branding(uuid, jsonb) from public;
grant execute on function public.site_branding() to anon;
grant execute on function public.admin_save_site_branding(uuid, jsonb) to anon;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.rooms (
  id text primary key,
  name text not null,
  slug text not null unique,
  description text not null default '',
  cover_image text,
  enabled boolean not null default true,
  published boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.templates (
  id text primary key,
  room_id text not null references public.rooms(id) on delete restrict,
  name text not null,
  thumbnail text,
  editor_data jsonb not null,
  enabled boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rooms_public_order_idx on public.rooms (display_order) where enabled and published;
create index if not exists templates_room_order_idx on public.templates (room_id, display_order) where enabled;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at before update on public.rooms for each row execute function public.set_updated_at();
drop trigger if exists templates_set_updated_at on public.templates;
create trigger templates_set_updated_at before update on public.templates for each row execute function public.set_updated_at();

alter table public.rooms enable row level security;
alter table public.templates enable row level security;
revoke all on public.rooms from anon, authenticated;
revoke all on public.templates from anon, authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.admin_credentials (
  username text primary key,
  password_hash text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists private.admin_sessions (
  token uuid primary key default gen_random_uuid(),
  username text not null references private.admin_credentials(username) on delete cascade,
  expires_at timestamptz not null default (now() + interval '12 hours'),
  created_at timestamptz not null default now()
);

insert into private.admin_credentials (username, password_hash, enabled)
values ('caspace2026', '$2a$12$GIl3tVDnyj3nSgz9nQ5gauuer6SYnlum5HfhqDPaXdcUPfZ/EmNMC', true)
on conflict (username) do update set password_hash = excluded.password_hash, enabled = true, updated_at = now();

create or replace function private.valid_admin_session(p_token uuid)
returns boolean
language sql
stable
security definer
set search_path = private, pg_catalog
as $$
  select exists (
    select 1
    from private.admin_sessions session
    join private.admin_credentials credential on credential.username = session.username
    where session.token = p_token and session.expires_at > now() and credential.enabled
  );
$$;

create or replace function public.admin_login(p_username text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = private, extensions, pg_catalog
as $$
declare
  session_token uuid;
begin
  delete from private.admin_sessions where expires_at <= now();
  if not exists (
    select 1 from private.admin_credentials
    where username = p_username and enabled and password_hash = crypt(p_password, password_hash)
  ) then
    return null;
  end if;
  insert into private.admin_sessions (username) values (p_username) returning token into session_token;
  return session_token;
end;
$$;

create or replace function public.admin_rooms(p_token uuid)
returns setof public.rooms
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not private.valid_admin_session(p_token) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  return query select * from public.rooms order by display_order, created_at;
end;
$$;

create or replace function public.admin_templates(p_token uuid)
returns setof public.templates
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not private.valid_admin_session(p_token) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  return query select * from public.templates order by display_order, created_at;
end;
$$;

create or replace function public.admin_upsert_room(p_token uuid, p_room jsonb)
returns public.rooms
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare result public.rooms;
begin
  if not private.valid_admin_session(p_token) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  insert into public.rooms (id, name, slug, description, cover_image, enabled, published, display_order)
  values (
    p_room->>'id', p_room->>'name', p_room->>'slug', coalesce(p_room->>'description', ''),
    nullif(p_room->>'cover_image', ''), coalesce((p_room->>'enabled')::boolean, true),
    coalesce((p_room->>'published')::boolean, false), coalesce((p_room->>'display_order')::integer, 0)
  )
  on conflict (id) do update set
    name = excluded.name, slug = excluded.slug, description = excluded.description,
    cover_image = excluded.cover_image, enabled = excluded.enabled, published = excluded.published,
    display_order = excluded.display_order
  returning * into result;
  return result;
end;
$$;

create or replace function public.admin_delete_room(p_token uuid, p_id text)
returns void
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not private.valid_admin_session(p_token) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  delete from public.rooms where id = p_id;
end;
$$;

create or replace function public.admin_upsert_template(p_token uuid, p_template jsonb)
returns public.templates
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare result public.templates;
begin
  if not private.valid_admin_session(p_token) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  insert into public.templates (id, room_id, name, thumbnail, editor_data, enabled, display_order)
  values (
    p_template->>'id', p_template->>'room_id', p_template->>'name', nullif(p_template->>'thumbnail', ''),
    p_template->'editor_data', coalesce((p_template->>'enabled')::boolean, false),
    coalesce((p_template->>'display_order')::integer, 0)
  )
  on conflict (id) do update set
    room_id = excluded.room_id, name = excluded.name, thumbnail = excluded.thumbnail,
    editor_data = excluded.editor_data, enabled = excluded.enabled, display_order = excluded.display_order
  returning * into result;
  return result;
end;
$$;

create or replace function public.admin_delete_template(p_token uuid, p_id text)
returns void
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not private.valid_admin_session(p_token) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  delete from public.templates where id = p_id;
end;
$$;

create or replace function public.published_rooms()
returns setof public.rooms
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select * from public.rooms where enabled and published order by display_order, created_at;
$$;

create or replace function public.published_templates()
returns setof public.templates
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select template.*
  from public.templates template
  join public.rooms room on room.id = template.room_id
  where template.enabled and room.enabled and room.published
  order by template.display_order, template.created_at;
$$;

revoke all on function public.admin_login(text, text) from public;
revoke all on function public.admin_rooms(uuid) from public;
revoke all on function public.admin_templates(uuid) from public;
revoke all on function public.admin_upsert_room(uuid, jsonb) from public;
revoke all on function public.admin_delete_room(uuid, text) from public;
revoke all on function public.admin_upsert_template(uuid, jsonb) from public;
revoke all on function public.admin_delete_template(uuid, text) from public;
revoke all on function public.published_rooms() from public;
revoke all on function public.published_templates() from public;

grant execute on function public.admin_login(text, text) to anon, authenticated;
grant execute on function public.admin_rooms(uuid) to anon, authenticated;
grant execute on function public.admin_templates(uuid) to anon, authenticated;
grant execute on function public.admin_upsert_room(uuid, jsonb) to anon, authenticated;
grant execute on function public.admin_delete_room(uuid, text) to anon, authenticated;
grant execute on function public.admin_upsert_template(uuid, jsonb) to anon, authenticated;
grant execute on function public.admin_delete_template(uuid, text) to anon, authenticated;
grant execute on function public.published_rooms() to anon, authenticated;
grant execute on function public.published_templates() to anon, authenticated;

create table if not exists public.customer_sessions (
  session_id uuid primary key default gen_random_uuid(),
  booth_id text not null references public.rooms(id),
  phone_number text not null,
  access_token uuid not null default gen_random_uuid(),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists one_active_customer_per_booth
  on public.customer_sessions (booth_id) where status = 'active';

create table if not exists public.session_photos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.customer_sessions(session_id) on delete cascade,
  booth_id text not null references public.rooms(id),
  storage_path text not null unique,
  source_name text not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  unique (session_id, content_hash)
);

create index if not exists session_photos_session_created_idx
  on public.session_photos (session_id, created_at desc);

alter table public.customer_sessions enable row level security;
alter table public.session_photos enable row level security;

create or replace function public.customer_start_photo_session(p_booth_id text, p_phone_number text)
returns table (session_id uuid, access_token uuid, booth_id text, phone_number text, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare new_session public.customer_sessions;
begin
  if p_phone_number !~ '^\+?[0-9]{9,15}$' then raise exception 'Invalid phone number'; end if;
  if not exists (select 1 from public.rooms where id = p_booth_id and enabled and published) then raise exception 'Invalid booth'; end if;
  update public.customer_sessions set status = 'completed', completed_at = now()
    where customer_sessions.booth_id = p_booth_id and status = 'active';
  insert into public.customer_sessions (booth_id, phone_number) values (p_booth_id, p_phone_number) returning * into new_session;
  return query select new_session.session_id, new_session.access_token, new_session.booth_id, new_session.phone_number, new_session.created_at;
end;
$$;

create or replace function public.customer_list_session_photos(p_session_id uuid, p_access_token uuid)
returns table (id uuid, session_id uuid, storage_path text, source_name text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select photo.id, photo.session_id, photo.storage_path, photo.source_name, photo.created_at
  from public.session_photos photo
  where photo.session_id = p_session_id
    and exists (select 1 from public.customer_sessions session where session.session_id = p_session_id and session.access_token = p_access_token)
  order by photo.created_at desc;
$$;

grant execute on function public.customer_start_photo_session(text, text) to anon, authenticated;
grant execute on function public.customer_list_session_photos(uuid, uuid) to anon, authenticated;

-- Realtime applies this policy before delivering a row. The client additionally uses
-- a server-side Realtime filter for exactly its current session_id.
drop policy if exists "Session photos are realtime readable" on public.session_photos;
create policy "Session photos are realtime readable" on public.session_photos for select to anon, authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('session-photos', 'session-photos', true, 26214400, array['image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Session photos are publicly readable" on storage.objects;
create policy "Session photos are publicly readable" on storage.objects for select using (bucket_id = 'session-photos');

alter publication supabase_realtime add table public.session_photos;

create table if not exists public.customer_sessions (
  session_id uuid primary key,
  booth_id text not null references public.rooms(id),
  phone_number text not null,
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('session-photos', 'session-photos', true, 26214400, array['image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Session photos are publicly readable" on storage.objects;
create policy "Session photos are publicly readable" on storage.objects for select
using (bucket_id = 'session-photos');

alter publication supabase_realtime add table public.session_photos;

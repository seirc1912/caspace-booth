create table if not exists public.print_orders (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null check (char_length(phone_number) between 6 and 32),
  room_id text not null references public.rooms(id) on delete restrict,
  total_images integer not null default 0 check (total_images >= 0),
  status text not null default 'Pending' check (status in ('Pending', 'Printing', 'Completed', 'Cancelled')),
  edit_token_hash bytea not null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.print_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.print_orders(id) on delete cascade,
  template_id text not null references public.templates(id) on delete restrict,
  storage_path text not null unique,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (order_id, template_id)
);

create index if not exists print_orders_queue_idx on public.print_orders (submitted_at desc) where submitted_at is not null;
create index if not exists print_order_items_order_idx on public.print_order_items (order_id, display_order);

drop trigger if exists print_orders_set_updated_at on public.print_orders;
create trigger print_orders_set_updated_at before update on public.print_orders for each row execute function public.set_updated_at();

alter table public.print_orders enable row level security;
alter table public.print_order_items enable row level security;
revoke all on public.print_orders from anon, authenticated;
revoke all on public.print_order_items from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('print-orders', 'print-orders', true, 52428800, array['image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.valid_print_order_token(p_order_id uuid, p_token uuid, p_require_draft boolean default true)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_catalog
as $$
  select exists (
    select 1 from public.print_orders
    where id = p_order_id
      and edit_token_hash = digest(p_token::text, 'sha256')
      and (not p_require_draft or submitted_at is null)
  );
$$;

create or replace function private.valid_print_order_upload(p_name text, p_metadata jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  path_parts text[] := string_to_array(p_name, '/');
  order_id uuid;
  edit_token uuid;
begin
  if array_length(path_parts, 1) <> 3 then return false; end if;
  begin
    order_id := path_parts[2]::uuid;
    edit_token := (p_metadata->>'orderToken')::uuid;
  exception when others then return false;
  end;
  return private.valid_print_order_token(order_id, edit_token, true);
end;
$$;

drop policy if exists "Draft orders can upload print images" on storage.objects;
create policy "Draft orders can upload print images" on storage.objects
for insert to anon
with check (bucket_id = 'print-orders' and private.valid_print_order_upload(name, user_metadata));

drop policy if exists "Draft orders can replace print images" on storage.objects;
create policy "Draft orders can replace print images" on storage.objects
for update to anon
using (bucket_id = 'print-orders')
with check (bucket_id = 'print-orders' and private.valid_print_order_upload(name, user_metadata));

drop policy if exists "Print order images can be read" on storage.objects;
create policy "Print order images can be read" on storage.objects
for select to anon
using (bucket_id = 'print-orders');

drop policy if exists "Known print order images can be deleted" on storage.objects;
create or replace function private.known_print_order_image(p_name text)
returns boolean language sql stable security definer set search_path = public, pg_catalog
as $$ select exists (select 1 from public.print_order_items where storage_path = p_name); $$;
create policy "Known print order images can be deleted" on storage.objects
for delete to anon
using (bucket_id = 'print-orders' and private.known_print_order_image(name));

create or replace function public.customer_create_print_order(p_phone_number text, p_room_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  order_id uuid;
  edit_token uuid := gen_random_uuid();
begin
  if not exists (select 1 from public.rooms where id = p_room_id and enabled and published) then
    raise exception 'Room is not available' using errcode = '22023';
  end if;
  insert into public.print_orders (phone_number, room_id, edit_token_hash)
  values (trim(p_phone_number), p_room_id, digest(edit_token::text, 'sha256'))
  returning id into order_id;
  return jsonb_build_object('id', order_id, 'editToken', edit_token);
end;
$$;

create or replace function public.customer_upsert_print_order_item(
  p_order_id uuid, p_edit_token uuid, p_template_id text, p_storage_path text, p_display_order integer
)
returns public.print_order_items
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare result public.print_order_items;
begin
  if not private.valid_print_order_token(p_order_id, p_edit_token, true) then raise exception 'Order is locked' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.templates template join public.print_orders order_record on order_record.id = p_order_id
    where template.id = p_template_id and template.room_id = order_record.room_id
  ) then raise exception 'Template does not belong to this Room' using errcode = '22023'; end if;
  insert into public.print_order_items (order_id, template_id, storage_path, display_order)
  values (p_order_id, p_template_id, p_storage_path, p_display_order)
  on conflict (order_id, template_id) do update set storage_path = excluded.storage_path, display_order = excluded.display_order
  returning * into result;
  update public.print_orders set total_images = (select count(*) from public.print_order_items where order_id = p_order_id) where id = p_order_id;
  return result;
end;
$$;

create or replace function public.customer_remove_print_order_item(p_order_id uuid, p_edit_token uuid, p_template_id text)
returns void
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not private.valid_print_order_token(p_order_id, p_edit_token, true) then raise exception 'Order is locked' using errcode = '42501'; end if;
  delete from public.print_order_items where order_id = p_order_id and template_id = p_template_id;
  update public.print_orders set total_images = (select count(*) from public.print_order_items where order_id = p_order_id) where id = p_order_id;
end;
$$;

create or replace function public.customer_submit_print_order(p_order_id uuid, p_edit_token uuid)
returns public.print_orders
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare result public.print_orders;
begin
  if not private.valid_print_order_token(p_order_id, p_edit_token, true) then raise exception 'Order is already submitted or unavailable' using errcode = '42501'; end if;
  if not exists (select 1 from public.print_order_items where order_id = p_order_id) then raise exception 'Print order is empty' using errcode = '22023'; end if;
  if (select count(*) from public.print_order_items where order_id = p_order_id) <>
     (select count(*) from public.templates template join public.print_orders orders on orders.room_id = template.room_id where orders.id = p_order_id and template.enabled)
  then raise exception 'Complete every Template before submitting' using errcode = '22023'; end if;
  update public.print_orders set submitted_at = now(), status = 'Pending', total_images = (select count(*) from public.print_order_items where order_id = p_order_id)
  where id = p_order_id returning * into result;
  return result;
end;
$$;

create or replace function public.admin_print_orders(p_token uuid)
returns table (id uuid, phone_number text, room_id text, room_name text, total_images integer, status text, submitted_at timestamptz, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not private.valid_admin_session(p_token) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  return query select orders.id, orders.phone_number, orders.room_id, rooms.name, orders.total_images, orders.status, orders.submitted_at, orders.created_at, orders.updated_at
  from public.print_orders orders join public.rooms rooms on rooms.id = orders.room_id
  where orders.submitted_at is not null order by orders.submitted_at desc;
end;
$$;

create or replace function public.admin_print_order_items(p_token uuid, p_order_id uuid)
returns table (id uuid, order_id uuid, template_id text, template_name text, storage_path text, display_order integer, created_at timestamptz)
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not private.valid_admin_session(p_token) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  return query select item.id, item.order_id, item.template_id, template.name, item.storage_path, item.display_order, item.created_at
  from public.print_order_items item join public.templates template on template.id = item.template_id
  where item.order_id = p_order_id order by item.display_order, item.created_at;
end;
$$;

create or replace function public.admin_update_print_order_status(p_token uuid, p_order_id uuid, p_status text)
returns public.print_orders
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare result public.print_orders;
begin
  if not private.valid_admin_session(p_token) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if p_status not in ('Pending', 'Printing', 'Completed', 'Cancelled') then raise exception 'Invalid status' using errcode = '22023'; end if;
  update public.print_orders set status = p_status where id = p_order_id and submitted_at is not null returning * into result;
  if result.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.admin_delete_print_order(p_token uuid, p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not private.valid_admin_session(p_token) then raise exception 'Unauthorized' using errcode = '42501'; end if;
  delete from public.print_orders where id = p_order_id;
end;
$$;

revoke all on function public.customer_create_print_order(text, text) from public;
revoke all on function public.customer_upsert_print_order_item(uuid, uuid, text, text, integer) from public;
revoke all on function public.customer_remove_print_order_item(uuid, uuid, text) from public;
revoke all on function public.customer_submit_print_order(uuid, uuid) from public;
revoke all on function public.admin_print_orders(uuid) from public;
revoke all on function public.admin_print_order_items(uuid, uuid) from public;
revoke all on function public.admin_update_print_order_status(uuid, uuid, text) from public;
revoke all on function public.admin_delete_print_order(uuid, uuid) from public;

grant execute on function public.customer_create_print_order(text, text) to anon;
grant execute on function public.customer_upsert_print_order_item(uuid, uuid, text, text, integer) to anon;
grant execute on function public.customer_remove_print_order_item(uuid, uuid, text) to anon;
grant execute on function public.customer_submit_print_order(uuid, uuid) to anon;
grant execute on function public.admin_print_orders(uuid) to anon;
grant execute on function public.admin_print_order_items(uuid, uuid) to anon;
grant execute on function public.admin_update_print_order_status(uuid, uuid, text) to anon;
grant execute on function public.admin_delete_print_order(uuid, uuid) to anon;

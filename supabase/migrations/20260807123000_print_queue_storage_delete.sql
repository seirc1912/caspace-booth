create or replace function private.known_print_order_image(p_name text)
returns boolean language sql stable security definer set search_path = public, pg_catalog
as $$ select exists (select 1 from public.print_order_items where storage_path = p_name); $$;

drop policy if exists "Known print order images can be deleted" on storage.objects;
create policy "Known print order images can be deleted" on storage.objects
for delete to anon
using (bucket_id = 'print-orders' and private.known_print_order_image(name));

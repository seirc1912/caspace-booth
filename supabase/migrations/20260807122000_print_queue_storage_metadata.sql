drop policy if exists "Draft orders can upload print images" on storage.objects;
create policy "Draft orders can upload print images" on storage.objects
for insert to anon
with check (bucket_id = 'print-orders' and private.valid_print_order_upload(name, user_metadata));

drop policy if exists "Draft orders can replace print images" on storage.objects;
create policy "Draft orders can replace print images" on storage.objects
for update to anon
using (bucket_id = 'print-orders')
with check (bucket_id = 'print-orders' and private.valid_print_order_upload(name, user_metadata));

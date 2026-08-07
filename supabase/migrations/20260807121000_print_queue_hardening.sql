create index if not exists print_orders_room_id_idx on public.print_orders (room_id);
create index if not exists print_order_items_template_id_idx on public.print_order_items (template_id);

drop policy if exists "Print orders are RPC only" on public.print_orders;
create policy "Print orders are RPC only" on public.print_orders for all to anon, authenticated using (false) with check (false);
drop policy if exists "Print order items are RPC only" on public.print_order_items;
create policy "Print order items are RPC only" on public.print_order_items for all to anon, authenticated using (false) with check (false);

revoke execute on function public.customer_create_print_order(text, text) from authenticated;
revoke execute on function public.customer_upsert_print_order_item(uuid, uuid, text, text, integer) from authenticated;
revoke execute on function public.customer_remove_print_order_item(uuid, uuid, text) from authenticated;
revoke execute on function public.customer_submit_print_order(uuid, uuid) from authenticated;
revoke execute on function public.admin_print_orders(uuid) from authenticated;
revoke execute on function public.admin_print_order_items(uuid, uuid) from authenticated;
revoke execute on function public.admin_update_print_order_status(uuid, uuid, text) from authenticated;
revoke execute on function public.admin_delete_print_order(uuid, uuid) from authenticated;

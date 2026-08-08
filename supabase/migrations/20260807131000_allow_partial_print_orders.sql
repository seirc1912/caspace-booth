create or replace function public.customer_submit_print_order(p_order_id uuid, p_edit_token uuid)
returns public.print_orders
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare result public.print_orders;
begin
  if not private.valid_print_order_token(p_order_id, p_edit_token, true) then
    raise exception 'Order is already submitted or unavailable' using errcode = '42501';
  end if;
  if not exists (select 1 from public.print_order_items where order_id = p_order_id) then
    raise exception 'Please select at least one photo.' using errcode = '22023';
  end if;
  update public.print_orders
  set submitted_at = now(), status = 'Pending',
      total_images = (select count(*) from public.print_order_items where order_id = p_order_id)
  where id = p_order_id
  returning * into result;
  return result;
end;
$$;

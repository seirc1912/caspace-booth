-- Make customer submission safe to retry after a lost response. Existing submitted
-- orders are returned only when the caller still proves possession of the edit token.
create or replace function public.customer_submit_print_order(p_order_id uuid, p_edit_token uuid)
returns public.print_orders
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare result public.print_orders;
begin
  if not private.valid_print_order_token(p_order_id, p_edit_token, false) then
    raise exception 'Order is unavailable' using errcode = '42501';
  end if;

  select * into result from public.print_orders where id = p_order_id;
  if result.submitted_at is not null then return result; end if;

  if not exists (select 1 from public.print_order_items where order_id = p_order_id) then
    raise exception 'Please select at least one photo.' using errcode = '22023';
  end if;

  update public.print_orders
  set submitted_at = now(), status = 'Pending',
      total_images = (select count(*) from public.print_order_items where order_id = p_order_id)
  where id = p_order_id and submitted_at is null
  returning * into result;

  -- A concurrent valid submit may have committed while this call waited on the
  -- row lock. Return that submitted row instead of a misleading null result.
  if result.id is null then
    select * into result from public.print_orders
    where id = p_order_id and submitted_at is not null;
  end if;
  return result;
end;
$$;

revoke all on function public.customer_submit_print_order(uuid, uuid) from public, authenticated;
grant execute on function public.customer_submit_print_order(uuid, uuid) to anon;

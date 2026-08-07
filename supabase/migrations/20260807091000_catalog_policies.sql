create index if not exists admin_sessions_username_idx on private.admin_sessions (username);

grant select on public.rooms to anon, authenticated;
grant select on public.templates to anon, authenticated;

create policy "Published Rooms are public"
on public.rooms for select
to anon, authenticated
using (enabled and published);

create policy "Published Templates are public"
on public.templates for select
to anon, authenticated
using (
  enabled and exists (
    select 1 from public.rooms room
    where room.id = templates.room_id and room.enabled and room.published
  )
);

alter function public.published_rooms() security invoker;
alter function public.published_templates() security invoker;

revoke execute on function public.admin_rooms(uuid) from authenticated;
revoke execute on function public.admin_templates(uuid) from authenticated;
revoke execute on function public.admin_upsert_room(uuid, jsonb) from authenticated;
revoke execute on function public.admin_delete_room(uuid, text) from authenticated;
revoke execute on function public.admin_upsert_template(uuid, jsonb) from authenticated;
revoke execute on function public.admin_delete_template(uuid, text) from authenticated;

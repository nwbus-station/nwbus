-- شاشات المحطات: استوديو الإعلانات. يحفظ إعدادات القالب مع الصورة المُصدَّرة ليمكن إعادة فتحها وتعديلها لاحقاً.
-- يتطلب 027. شغّل الكتلة في Supabase SQL Editor.

create or replace function public.signage_media_set_config(p_id uuid, p_config jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a public.users; m public.signage_media; s jsonb;
begin
  if public.signage_role() is null then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  select * into m from public.signage_media where id = p_id;
  if not found then raise exception 'not found'; end if;
  if m.kind <> 'image' then raise exception 'bad kind'; end if;
  if public.signage_role() <> 'admin' and m.uploaded_by is distinct from a.id then raise exception 'not allowed'; end if;
  s := p_config -> 'studio';
  if s is null or jsonb_typeof(s) <> 'object' or length(s::text) > 20000 then raise exception 'bad config'; end if;
  update public.signage_media set config = jsonb_build_object('studio', s) where id = p_id;
  perform public.signage_log('media.studio', p_id::text, jsonb_build_object('title', m.title, 'template', left(coalesce(s ->> 'template', ''), 20)));
end $$;
revoke all on function public.signage_media_set_config(uuid, jsonb) from public, anon;
grant execute on function public.signage_media_set_config(uuid, jsonb) to authenticated;

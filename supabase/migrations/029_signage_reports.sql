-- شاشات المحطات: ترتيب الحملات، إعادة تسمية المحتوى، وبيانات تقارير العرض (مرات ومدة العرض لكل شاشة وحملة).
-- يتطلب 027 و028. شغّل كل كتلة (مفصولة بسطر ═══) بشكل منفصل في Supabase SQL Editor، بالترتيب.

-- ═════ 1) ترتيب الحملات (ترتيب العرض على الشاشات): الأصغر أولاً ═════
create or replace function public.signage_campaign_reorder(p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.signage_role() is null then raise exception 'not allowed'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then raise exception 'bad ids'; end if;
  update public.signage_campaigns c set sort = u.ord * 10
  from unnest(p_ids) with ordinality as u(id, ord) where c.id = u.id;
  perform public.signage_log('campaign.reorder', null, jsonb_build_object('count', cardinality(p_ids)));
end $$;

-- ═════ 2) إعادة تسمية محتوى (الأدمن أو من رفعه) ═════
create or replace function public.signage_media_rename(p_id uuid, p_title text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.users; m public.signage_media;
begin
  if public.signage_role() is null then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  select * into m from public.signage_media where id = p_id;
  if not found then raise exception 'not found'; end if;
  if public.signage_role() <> 'admin' and m.uploaded_by is distinct from a.id then raise exception 'not allowed'; end if;
  if p_title is null or btrim(p_title) = '' or length(p_title) > 120 then raise exception 'title required'; end if;
  update public.signage_media set title = btrim(p_title) where id = p_id;
  perform public.signage_log('media.rename', p_id::text, jsonb_build_object('from', m.title, 'title', btrim(p_title)));
end $$;

-- ═════ 3) تقرير العرض: مرات ومدة العرض مجمّعة لكل شاشة وحملة خلال فترة ═════
create or replace function public.signage_report_plays(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql security definer stable set search_path = public as $$
begin
  if public.signage_role() is null then raise exception 'not allowed'; end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then raise exception 'bad period'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('device_id', x.device_id, 'campaign_id', x.campaign_id, 'plays', x.plays, 'seconds', x.secs))
    from (select device_id, campaign_id, count(*) as plays, coalesce(sum(seconds), 0) as secs
          from public.signage_playlog where played_at >= p_from and played_at < p_to group by device_id, campaign_id) x
  ), '[]'::jsonb);
end $$;

revoke all on function public.signage_campaign_reorder(uuid[]), public.signage_media_rename(uuid, text), public.signage_report_plays(timestamptz, timestamptz) from public, anon;
grant execute on function public.signage_campaign_reorder(uuid[]), public.signage_media_rename(uuid, text), public.signage_report_plays(timestamptz, timestamptz) to authenticated;

-- شاشات المحطات: «شاشة العرض» (حركة الرحلات المباشرة) كنوع محتوى يُعرض على شاشات المحطات بمفتاح الجهاز (بدون حساب موظف).
-- يتطلب تشغيل 027 أولاً. شغّل كل كتلة (مفصولة بسطر ═══) بشكل منفصل في Supabase SQL Editor، بالترتيب.

-- ═════ 1) نوع محتوى جديد: board (بدون ملف) + إعداداته ═════
alter table public.signage_media add column if not exists config jsonb not null default '{}'::jsonb;
alter table public.signage_media drop constraint if exists signage_media_kind_check;
alter table public.signage_media add constraint signage_media_kind_check check (kind in ('image', 'video', 'board'));

-- ═════ 2) إضافة عنصر «شاشة العرض» للمكتبة ═════
create or replace function public.signage_board_add(p_title text, p_mode text, p_layout text, p_theme text, p_duration int default 30) returns uuid
language plpgsql security definer set search_path = public as $$
declare a public.users; v_id uuid;
begin
  if public.signage_role() is null then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  if p_title is null or btrim(p_title) = '' or length(p_title) > 120 then raise exception 'title required'; end if;
  if p_mode not in ('scheduled', 'actual') then raise exception 'bad board mode'; end if;
  if p_layout not in ('columns', 'feed', 'auto') then raise exception 'bad board layout'; end if;
  if p_theme not in ('nwb', 'navy', 'black', 'teal') then raise exception 'bad board theme'; end if;
  insert into public.signage_media (kind, title, path, mime, size_bytes, duration_sec, config, uploaded_by, uploaded_by_name)
  values ('board', btrim(p_title), 'board/' || gen_random_uuid()::text, 'application/x-board', 1, greatest(5, least(1800, coalesce(p_duration, 30))),
          jsonb_build_object('mode', p_mode, 'layout', p_layout, 'theme', p_theme), a.id, coalesce(a.full_name_ar, ''))
  returning id into v_id;
  perform public.signage_log('media.add', v_id::text, jsonb_build_object('title', btrim(p_title), 'kind', 'board', 'mode', p_mode));
  return v_id;
end $$;

revoke all on function public.signage_board_add(text, text, text, text, int) from public, anon;
grant execute on function public.signage_board_add(text, text, text, text, int) to authenticated;

-- ═════ 3) القائمة تحمل إعدادات شاشة العرض ═════
create or replace function public.signage_manifest(p_secret text, p_version text default null, p_playing text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.signage_devices; e public.signage_emergency; v_now timestamptz := now(); lt timestamp; v_dow int; v_min int; v_items jsonb; v_em jsonb := null; st text;
begin
  d := public.signage_device_of(p_secret);
  if d.id is null then raise exception 'unauthorized'; end if;
  update public.signage_devices set last_seen_at = v_now, app_version = coalesce(left(p_version, 40), app_version), now_playing = coalesce(left(p_playing, 120), now_playing) where id = d.id;
  if random() < 0.01 then
    delete from public.signage_playlog where played_at < now() - interval '90 days';
    delete from public.signage_audit where at < now() - interval '2 years';
  end if;
  lt := v_now at time zone 'Asia/Riyadh';
  v_dow := extract(dow from lt)::int;
  v_min := extract(hour from lt)::int * 60 + extract(minute from lt)::int;
  select * into e from public.signage_emergency where id = 1;
  if e.active and (e.ends_at is null or e.ends_at > v_now) then v_em := jsonb_build_object('message', e.message); end if;
  select coalesce(nullif(name_ar, ''), name_en) into st from public.stations where id = d.station_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'campaign_id', c.id, 'media_id', m.id, 'kind', m.kind, 'path', m.path, 'mime', m.mime, 'size', m.size_bytes, 'config', m.config,
      'duration', case when m.kind = 'video' then m.duration_sec else coalesce(c.duration_sec, m.duration_sec) end, 'title', c.title
    ) order by c.sort, c.created_at), '[]'::jsonb) into v_items
  from public.signage_campaigns c join public.signage_media m on m.id = c.media_id
  where c.status = 'approved'
    and (c.starts_at is null or c.starts_at <= v_now) and (c.ends_at is null or c.ends_at > v_now)
    and (c.days is null or v_dow = any(c.days))
    and (c.from_min is null or (case when c.from_min <= c.to_min then v_min >= c.from_min and v_min < c.to_min else v_min >= c.from_min or v_min < c.to_min end))
    and (c.scope = 'all' or (c.scope = 'stations' and d.station_id = any(c.station_ids)) or (c.scope = 'devices' and d.id = any(c.device_ids)));
  return jsonb_build_object('device', jsonb_build_object('id', d.id, 'name', d.name, 'orientation', d.orientation, 'station', st),
    'now', v_now, 'emergency', v_em, 'items', v_items, 'ttl', 43200);
end $$;

-- ═════ 4) بيانات شاشة العرض للجهاز: رحلات محطة الجهاز (أو كل المحطات إن لم تُحدَّد له محطة) ═════
-- mode = actual: ما سُجّل اليوم فعلاً (آخر 40 حركة) | scheduled: جدول اليوم (من قبل ساعة إلى 12 ساعة قادمة)
create or replace function public.signage_board(p_secret text, p_mode text default 'scheduled') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d public.signage_devices;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_now int := extract(hour from (now() at time zone 'Asia/Riyadh'))::int * 60 + extract(minute from (now() at time zone 'Asia/Riyadh'))::int;
  v_scoped boolean; v_ev jsonb; v_st text;
begin
  d := public.signage_device_of(p_secret);
  if d.id is null then raise exception 'unauthorized'; end if;
  v_scoped := d.station_id is not null;
  select coalesce(nullif(name_ar, ''), name_en) into v_st from public.stations where id = d.station_id;

  if p_mode = 'actual' then
    with r as (
      select x.id, x.bus_number, x.actual_arrival, x.actual_departure, x.station_id as rs, t.trip_number, t.from_station_id as fs, t.to_station_id as dst
      from public.trip_records x join public.trip_schedule t on t.id = x.trip_schedule_id
      where x.record_date = v_today and (not v_scoped or x.station_id = d.station_id)
      order by x.updated_at desc nulls last limit 60
    ), legs as (
      select x.id::text || '-a' as eid, 'arrival' as etype, x.actual_arrival as ev_at, x.bus_number as bus, x.trip_number as tn,
             x.fs as f_id, case when v_scoped then x.rs else x.dst end as t_id from r x where x.actual_arrival is not null
      union all
      select x.id::text || '-d', 'departure', x.actual_departure, x.bus_number, x.trip_number,
             case when v_scoped then x.rs else x.fs end, x.dst from r x where x.actual_departure is not null
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.eid, 'type', l.etype, 'time', to_char(l.ev_at at time zone 'Asia/Riyadh', 'HH24:MI'), 'sort', l.ev_at, 'status', 'done', 'bus', l.bus,
        'trip', jsonb_build_object('trip_number', l.tn,
          'from_station', jsonb_build_object('name_ar', fa.name_ar, 'name_en', fa.name_en),
          'to_station', jsonb_build_object('name_ar', ta.name_ar, 'name_en', ta.name_en))
      ) order by l.ev_at desc), '[]'::jsonb) into v_ev
    from (select * from legs order by ev_at desc limit 40) l
    join public.stations fa on fa.id = l.f_id join public.stations ta on ta.id = l.t_id;

  elsif v_scoped then
    with s as (
      select t.trip_number as tn, t.from_station_id as fs, t.to_station_id as dst, st.arr_enabled, st.dep_enabled,
        nullif(left(coalesce(st.arrival_time::text, ss.arrival_time::text, case when t.to_station_id = d.station_id then t.scheduled_arrival::text end), 5), '') as arr_tm,
        nullif(left(coalesce(st.departure_time::text, ss.departure_time::text, case when t.from_station_id = d.station_id then t.scheduled_departure::text end), 5), '') as dep_tm
      from public.station_trips st join public.trip_schedule t on t.id = st.trip_schedule_id
      left join public.trip_schedule_stops ss on ss.trip_schedule_id = t.id and ss.station_id = d.station_id
      where st.station_id = d.station_id and t.is_active is not false and (coalesce(t.is_rf, false) = false or t.rf_date = v_today)
    ), legs as (
      select tn || '-a' as eid, 'arrival' as etype, arr_tm as tm, tn, fs as f_id, d.station_id as t_id from s where arr_enabled is not false and arr_tm is not null
      union all
      select tn || '-d', 'departure', dep_tm, tn, d.station_id, dst from s where dep_enabled is not false and dep_tm is not null
    ), w as (
      select *, split_part(tm, ':', 1)::int * 60 + split_part(tm, ':', 2)::int as mins from legs
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', w.eid, 'type', w.etype, 'time', w.tm, 'status', case when w.mins <= v_now then 'done' else 'upcoming' end,
        'trip', jsonb_build_object('trip_number', w.tn,
          'from_station', jsonb_build_object('name_ar', fa.name_ar, 'name_en', fa.name_en),
          'to_station', jsonb_build_object('name_ar', ta.name_ar, 'name_en', ta.name_en))
      ) order by w.mins), '[]'::jsonb) into v_ev
    from w join public.stations fa on fa.id = w.f_id join public.stations ta on ta.id = w.t_id
    where w.mins between v_now - 60 and v_now + 720;

  else
    with t0 as (
      select t.trip_number as tn, t.from_station_id as fs, t.to_station_id as dst,
        nullif(left(t.scheduled_departure::text, 5), '') as dep_tm, nullif(left(t.scheduled_arrival::text, 5), '') as arr_tm
      from public.trip_schedule t where t.is_active and (coalesce(t.is_rf, false) = false or t.rf_date = v_today)
    ), legs as (
      select tn || '-d' as eid, 'departure' as etype, dep_tm as tm, tn, fs as f_id, dst as t_id from t0 where dep_tm is not null
      union all
      select tn || '-a', 'arrival', arr_tm, tn, fs, dst from t0 where arr_tm is not null
    ), w as (
      select *, split_part(tm, ':', 1)::int * 60 + split_part(tm, ':', 2)::int as mins from legs
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', w.eid, 'type', w.etype, 'time', w.tm, 'status', case when w.mins <= v_now then 'done' else 'upcoming' end,
        'trip', jsonb_build_object('trip_number', w.tn,
          'from_station', jsonb_build_object('name_ar', fa.name_ar, 'name_en', fa.name_en),
          'to_station', jsonb_build_object('name_ar', ta.name_ar, 'name_en', ta.name_en))
      ) order by w.mins), '[]'::jsonb) into v_ev
    from w join public.stations fa on fa.id = w.f_id join public.stations ta on ta.id = w.t_id
    where w.mins between v_now - 60 and v_now + 720;
  end if;

  return jsonb_build_object('station', v_st, 'mode', case when p_mode = 'actual' then 'actual' else 'scheduled' end, 'now', now(), 'events', v_ev);
end $$;

revoke all on function public.signage_board(text, text) from public;
grant execute on function public.signage_board(text, text) to anon, authenticated;

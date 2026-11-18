-- شاشة العرض و/board: الرحلات تأتي من نفس قواعد جدول «الترحيل» (وصول/مغادرة لكل محطة):
--  - الرحلة فعّالة، وتاريخها/أيام تشغيلها صحيحة (rf_date, start_date, end_date, days_of_week)
--  - محطة الوجهة: وصول فقط | محطة المنشأ: مغادرة فقط | محطة عبور: وصول ومغادرة مع تجاهل الرحلات داخل نفس المدينة
--  - الوقت: تعديل المحطة اليدوي (station_trips) ثم وقت التوقف ثم وقت الرحلة
-- يتطلب 028، ويحل محل signage_board. شغّل كل كتلة (مفصولة بسطر ═══) وحدها.

-- ═════ 1) محرّك الرحلات: وصول/مغادرة كل محطة لليوم (نسخة SQL من منطق صفحة الترحيل) ═════
create or replace function public.board_legs(p_station uuid default null)
returns table (station_id uuid, trip_id uuid, trip_number text, role text, tm text, f_id uuid, t_id uuid)
language sql stable security definer set search_path = public as $$
  with b as (
    select st.station_id as sid, t.id as tid, t.trip_number as tn, t.from_station_id as fs, t.to_station_id as ts,
      t.scheduled_departure as sd, t.scheduled_arrival as sa, st.arrival_time as at_, st.departure_time as dt_,
      st.arr_enabled, st.dep_enabled, sp.arrival_time as sarr, sp.departure_time as sdep, (sp.trip_schedule_id is not null) as has_stop,
      coalesce(nullif(cs.city_group, ''), nullif(lower((regexp_split_to_array(coalesce(cs.name_en, ''), '[\s-]+'))[1]), '')) as cg,
      coalesce(nullif(fsx.city_group, ''), nullif(lower((regexp_split_to_array(coalesce(fsx.name_en, ''), '[\s-]+'))[1]), '')) as fg,
      coalesce(nullif(tsx.city_group, ''), nullif(lower((regexp_split_to_array(coalesce(tsx.name_en, ''), '[\s-]+'))[1]), '')) as tg
    from public.station_trips st
    join public.trip_schedule t on t.id = st.trip_schedule_id
    join public.stations cs on cs.id = st.station_id
    join public.stations fsx on fsx.id = t.from_station_id
    join public.stations tsx on tsx.id = t.to_station_id
    left join lateral (select s2.trip_schedule_id, s2.arrival_time, s2.departure_time from public.trip_schedule_stops s2 where s2.trip_schedule_id = t.id and s2.station_id = st.station_id limit 1) sp on true
    where (p_station is null or st.station_id = p_station)
      and t.is_active is true
      and (coalesce(t.is_rf, false) = false or t.rf_date = (now() at time zone 'Asia/Riyadh')::date)
      and (t.start_date is null or (now() at time zone 'Asia/Riyadh')::date >= t.start_date)
      and (t.end_date is null or (now() at time zone 'Asia/Riyadh')::date <= t.end_date)
      and (t.days_of_week is null or cardinality(t.days_of_week) = 0 or extract(dow from (now() at time zone 'Asia/Riyadh'))::int = any (t.days_of_week::int[]))
  ), x as (
    select b.*,
      (cg is not null and fg is not null and cg = fg) as same_from, (cg is not null and tg is not null and cg = tg) as same_to
    from b
  ), y as (
    select x.*,
      case when ts = sid then coalesce(at_, sa)
           when fs = sid then null
           when has_stop then (case when same_from then null else coalesce(at_, sarr) end)
           else (case when same_from then null else at_ end) end as t_arr,
      case when ts = sid then null
           when fs = sid then coalesce(dt_, sd)
           when has_stop then (case when same_to then null else coalesce(dt_, sdep) end)
           else (case when same_to then null else dt_ end) end as t_dep
    from x
  )
  select sid, tid, tn, 'arrival', left(t_arr::text, 5), fs, sid from y where t_arr is not null and arr_enabled is not false
  union all
  select sid, tid, tn, 'departure', left(t_dep::text, 5), sid, ts from y where t_dep is not null and dep_enabled is not false
$$;
revoke all on function public.board_legs(uuid) from public, anon, authenticated;

-- ═════ 2) بناء بيانات الشاشة (لمحطة أو لكل المحطات) ═════
create or replace function public.board_build(p_station uuid, p_mode text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_now int := extract(hour from (now() at time zone 'Asia/Riyadh'))::int * 60 + extract(minute from (now() at time zone 'Asia/Riyadh'))::int;
  v_scoped boolean := p_station is not null; v_ev jsonb; v_st text;
begin
  select coalesce(nullif(name_ar, ''), name_en) into v_st from public.stations where id = p_station;

  if p_mode = 'actual' then
    -- فعلي: ما سُجّل اليوم (وطرف الحدث هو محطة التسجيل) بشرط أن يكون ضمن جدول الترحيل لتلك المحطة، ثم القادم المجدول لمحطة واحدة
    with lg as (select * from public.board_legs(p_station)),
    r as (
      select x.id, x.bus_number, x.actual_arrival, x.actual_departure, x.station_id as rs, t.id as tid, t.trip_number, t.from_station_id as fs, t.to_station_id as dst
      from public.trip_records x join public.trip_schedule t on t.id = x.trip_schedule_id
      where x.record_date = v_today and (not v_scoped or x.station_id = p_station)
      order by x.updated_at desc nulls last limit 120
    ), dlegs as (
      select 'arrival' as etype, x.actual_arrival as ev_at, x.bus_number as bus, x.trip_number as tn, x.tid, x.fs as f_id, x.rs as t_id, x.rs as sid from r x where x.actual_arrival is not null
      union all
      select 'departure', x.actual_departure, x.bus_number, x.trip_number, x.tid, x.rs, x.dst, x.rs from r x where x.actual_departure is not null
    ), dok as (
      select d.*, l.tm as sched from dlegs d join lg l on l.station_id = d.sid and l.trip_id = d.tid and l.role = d.etype
    ), dn as (
      select * from (select * from dok order by ev_at desc limit 40) q
    ), slm as (
      select l.*, split_part(l.tm, ':', 1)::int * 60 + split_part(l.tm, ':', 2)::int as mins from lg l where v_scoped
    ), up as (
      select u.*, row_number() over (partition by u.role order by u.mins) as rn from slm u
      where u.mins >= v_now - 10 and u.mins <= v_now + 360
        and not exists (select 1 from dlegs g where g.tid = u.trip_id and g.etype = u.role and g.sid = u.station_id)
    )
    select coalesce(jsonb_agg(z.j order by z.grp, z.ord), '[]'::jsonb) into v_ev from (
      select 0 as grp, u.mins::numeric as ord, jsonb_build_object(
          'id', u.trip_number || '-' || u.role || '-up', 'type', u.role, 'time', u.tm, 'status', 'upcoming', 'bus', null,
          'trip', jsonb_build_object('trip_number', u.trip_number,
            'from_station', jsonb_build_object('name_ar', fa.name_ar, 'name_en', fa.name_en),
            'to_station', jsonb_build_object('name_ar', ta.name_ar, 'name_en', ta.name_en))) as j
      from up u join public.stations fa on fa.id = u.f_id join public.stations ta on ta.id = u.t_id where u.rn <= 6
      union all
      select 1, -extract(epoch from n.ev_at), jsonb_build_object(
          'id', n.tn || '-' || n.etype || '-' || n.sid::text || '-' || to_char(n.ev_at, 'HH24MI'), 'type', n.etype,
          'time', to_char(n.ev_at at time zone 'UTC', 'HH24:MI'), 'sort', n.ev_at, 'status', 'done', 'bus', n.bus, 'sched', n.sched,
          'trip', jsonb_build_object('trip_number', n.tn,
            'from_station', jsonb_build_object('name_ar', fa.name_ar, 'name_en', fa.name_en),
            'to_station', jsonb_build_object('name_ar', ta.name_ar, 'name_en', ta.name_en)))
      from dn n join public.stations fa on fa.id = n.f_id join public.stations ta on ta.id = n.t_id
    ) z;
  else
    -- جدول اليوم: من قبل ساعة إلى 12 ساعة قادمة
    with w as (
      select l.*, split_part(l.tm, ':', 1)::int * 60 + split_part(l.tm, ':', 2)::int as mins from public.board_legs(p_station) l
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', w.trip_number || '-' || w.role || '-' || w.station_id::text, 'type', w.role, 'time', w.tm,
        'status', case when w.mins <= v_now then 'done' else 'upcoming' end,
        'trip', jsonb_build_object('trip_number', w.trip_number,
          'from_station', jsonb_build_object('name_ar', fa.name_ar, 'name_en', fa.name_en),
          'to_station', jsonb_build_object('name_ar', ta.name_ar, 'name_en', ta.name_en))
      ) order by w.mins), '[]'::jsonb) into v_ev
    from w join public.stations fa on fa.id = w.f_id join public.stations ta on ta.id = w.t_id
    where w.mins between v_now - 60 and v_now + 720;
  end if;

  return jsonb_build_object('station', v_st, 'mode', case when p_mode = 'actual' then 'actual' else 'scheduled' end, 'now', now(), 'events', v_ev);
end $$;
revoke all on function public.board_build(uuid, text) from public, anon, authenticated;

-- ═════ 3) واجهات الاستدعاء: جهاز الشاشة (بمفتاحه) + صفحة /board للموظفين ═════
create or replace function public.signage_board(p_secret text, p_mode text default 'scheduled') returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.signage_devices;
begin
  d := public.signage_device_of(p_secret);
  if d.id is null then raise exception 'unauthorized'; end if;
  return public.board_build(d.station_id, p_mode);
end $$;
revoke all on function public.signage_board(text, text) from public;
grant execute on function public.signage_board(text, text) to anon, authenticated;

create or replace function public.board_live(p_station uuid default null, p_mode text default 'scheduled') returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  return public.board_build(p_station, p_mode);
end $$;
revoke all on function public.board_live(uuid, text) from public, anon;
grant execute on function public.board_live(uuid, text) to authenticated;

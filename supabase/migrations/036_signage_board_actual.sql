-- شاشة العرض (الفعلي): تصحيح الأوقات + دمج الرحلات القادمة + رقم الحافلة + الالتزام بالموعد.
-- النظام يحفظ وقت الموظف كما كتبه (مثلاً 06:53) كـ timestamptz بتسمية UTC، لذلك يُقرأ بتوقيت UTC لا الرياض.
-- يتطلب 028.

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

  if p_mode = 'actual' and v_scoped then
    -- فعلي + القادم: ما سُجّل اليوم لهذه المحطة، ثم الرحلات المجدولة القادمة (6 ساعات، حتى 6 لكل اتجاه) التي لم تُسجَّل بعد
    with r as (
      select x.id, x.bus_number, x.actual_arrival, x.actual_departure, x.station_id as rs, t.trip_number, t.from_station_id as fs, t.to_station_id as dst
      from public.trip_records x join public.trip_schedule t on t.id = x.trip_schedule_id
      where x.record_date = v_today and x.station_id = d.station_id
      order by x.updated_at desc nulls last limit 60
    ), dlegs as (
      select 'arrival' as etype, x.actual_arrival as ev_at, x.bus_number as bus, x.trip_number as tn, x.fs as f_id, x.rs as t_id from r x where x.actual_arrival is not null
      union all
      select 'departure', x.actual_departure, x.bus_number, x.trip_number, x.rs, x.dst from r x where x.actual_departure is not null
    ), s as (
      select t.trip_number as tn, t.from_station_id as fs, t.to_station_id as dst, st.arr_enabled, st.dep_enabled,
        nullif(left(coalesce(st.arrival_time::text, ss.arrival_time::text, case when t.to_station_id = d.station_id then t.scheduled_arrival::text end), 5), '') as arr_tm,
        nullif(left(coalesce(st.departure_time::text, ss.departure_time::text, case when t.from_station_id = d.station_id then t.scheduled_departure::text end), 5), '') as dep_tm
      from public.station_trips st join public.trip_schedule t on t.id = st.trip_schedule_id
      left join public.trip_schedule_stops ss on ss.trip_schedule_id = t.id and ss.station_id = d.station_id
      where st.station_id = d.station_id and t.is_active is not false and (coalesce(t.is_rf, false) = false or t.rf_date = v_today)
    ), sl as (
      select tn, 'arrival' as etype, arr_tm as tm, fs as f_id, d.station_id as t_id from s where arr_enabled is not false and arr_tm is not null
      union all
      select tn, 'departure', dep_tm, d.station_id, dst from s where dep_enabled is not false and dep_tm is not null
    ), slm as (
      select *, split_part(tm, ':', 1)::int * 60 + split_part(tm, ':', 2)::int as mins from sl
    ), dn as (
      select l.*, (select sl.tm from sl where sl.tn = l.tn and sl.etype = l.etype limit 1) as sched
      from (select * from dlegs order by ev_at desc limit 40) l
    ), up as (
      select u.*, row_number() over (partition by u.etype order by u.mins) as rn
      from slm u
      where u.mins > v_now and u.mins <= v_now + 360
        and not exists (select 1 from dlegs g where g.tn = u.tn and g.etype = u.etype)
    )
    select coalesce(jsonb_agg(z.j order by z.grp, z.ord), '[]'::jsonb) into v_ev from (
      select 0 as grp, u.mins::numeric as ord, jsonb_build_object(
          'id', u.tn || '-' || u.etype || '-up', 'type', u.etype, 'time', u.tm, 'status', 'upcoming', 'bus', null,
          'trip', jsonb_build_object('trip_number', u.tn,
            'from_station', jsonb_build_object('name_ar', fa.name_ar, 'name_en', fa.name_en),
            'to_station', jsonb_build_object('name_ar', ta.name_ar, 'name_en', ta.name_en))) as j
      from up u join public.stations fa on fa.id = u.f_id join public.stations ta on ta.id = u.t_id where u.rn <= 6
      union all
      select 1, -extract(epoch from n.ev_at), jsonb_build_object(
          'id', n.tn || '-' || n.etype || '-' || to_char(n.ev_at, 'HH24MI'), 'type', n.etype,
          'time', to_char(n.ev_at at time zone 'UTC', 'HH24:MI'), 'sort', n.ev_at, 'status', 'done', 'bus', n.bus, 'sched', n.sched,
          'trip', jsonb_build_object('trip_number', n.tn,
            'from_station', jsonb_build_object('name_ar', fa.name_ar, 'name_en', fa.name_en),
            'to_station', jsonb_build_object('name_ar', ta.name_ar, 'name_en', ta.name_en)))
      from dn n join public.stations fa on fa.id = n.f_id join public.stations ta on ta.id = n.t_id
    ) z;

  elsif p_mode = 'actual' then
    with r as (
      select x.id, x.bus_number, x.actual_arrival, x.actual_departure, x.station_id as rs, t.trip_number, t.from_station_id as fs, t.to_station_id as dst
      from public.trip_records x join public.trip_schedule t on t.id = x.trip_schedule_id
      where x.record_date = v_today
      order by x.updated_at desc nulls last limit 60
    ), legs as (
      select x.id::text || '-a' as eid, 'arrival' as etype, x.actual_arrival as ev_at, x.bus_number as bus, x.trip_number as tn, x.fs as f_id, x.dst as t_id from r x where x.actual_arrival is not null
      union all
      select x.id::text || '-d', 'departure', x.actual_departure, x.bus_number, x.trip_number, x.fs, x.dst from r x where x.actual_departure is not null
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.eid, 'type', l.etype, 'time', to_char(l.ev_at at time zone 'UTC', 'HH24:MI'), 'sort', l.ev_at, 'status', 'done', 'bus', l.bus,
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

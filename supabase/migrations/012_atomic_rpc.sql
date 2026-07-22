-- ============================================================
-- 012: عمليات ذرّية داخل القاعدة (معاملة واحدة — يا كله يا بلاش)
--   1) import_schedule(payload)      : رفع/تحديث جدول الرحلات كاملاً
--   2) merge_stations_rpc(src, dst)  : دمج محطة مكررة في الأساسية
-- تُنفَّذ بصلاحية المالك (SECURITY DEFINER) مع تحقق أن المستدعي أدمن عام.
-- أي فشل في أي خطوة = تراجع كامل تلقائي. انقطاع النت لا يترك حالة ناقصة.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1) رفع جدول الرحلات — نفس منطق الواجهة الحالي حرفياً لكن ذرّي
-- ─────────────────────────────────────────────────────────────
create or replace function import_schedule(
  payload    jsonb,
  file_name  text default null,
  start_date date default null,
  end_date   date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid;
  v_uname text;
  v_role  text;
  v_new_stations int := 0;
  v_added        int := 0;
  v_updated      int := 0;
  v_off          int := 0;
  v_stops        int := 0;
  v_period       text := payload->>'period';
begin
  /* تحقق الصلاحية: أدمن عام فقط */
  select u.id, u.full_name_ar, u.role into v_uid, v_uname, v_role
  from users u where u.auth_id = auth.uid();
  if v_uid is null or v_role <> 'general_admin' then
    raise exception 'غير مصرح — رفع الجدول للأدمن العام فقط';
  end if;

  /* 0) رحلات الملف (بدون تكرار رقم الرحلة) */
  drop table if exists _file_trips;
  create temp table _file_trips on commit drop as
  select distinct on (t->>'code')
    t->>'code'                                            as code,
    nullif(trim(coalesce(t->>'route','')), '')            as route,
    nullif(trim(coalesce(t->>'startTime','')), '')        as start_time,
    nullif(trim(coalesce(t->>'endTime','')), '')          as end_time,
    nullif(trim(coalesce(t->>'dispatchInfo','')), '')     as dispatch_info,
    nullif(trim(coalesce(t->>'dispatchTime','')), '')     as dispatch_time,
    coalesce(nullif(trim(coalesce(t->>'busType','')),''),'WHEELCHAIR') as bus_type,
    nullif(trim(coalesce(t->>'startStation','')), '')     as start_station,
    nullif(trim(coalesce(t->>'endStation','')), '')       as end_station
  from jsonb_array_elements(coalesce(payload->'trips','[]'::jsonb)) t
  where nullif(trim(coalesce(t->>'code','')),'') is not null;

  drop table if exists _file_stops;
  create temp table _file_stops on commit drop as
  select
    s->>'code'                                        as code,
    nullif(trim(coalesce(s->>'station','')), '')      as station,
    nullif(s->>'stopOrder','')::int                   as stop_order,
    nullif(trim(coalesce(s->>'arrival','')), '')      as arrival,
    nullif(trim(coalesce(s->>'departure','')), '')    as departure,
    nullif(trim(coalesce(s->>'status','')), '')       as status
  from jsonb_array_elements(coalesce(payload->'stops','[]'::jsonb)) s;

  /* 1) إضافة المحطات الناقصة (الاسم الإنجليزي كما هو) */
  drop table if exists _names;
  create temp table _names on commit drop as
  select distinct n from (
    select jsonb_array_elements_text(coalesce(payload->'stations','[]'::jsonb)) as n
    union select station       from _file_stops where station is not null
    union select start_station from _file_trips where start_station is not null
    union select end_station   from _file_trips where end_station is not null
  ) x where nullif(trim(coalesce(n,'')),'') is not null;

  insert into stations (name_ar, name_en, type, is_active, created_by)
  select nm.n, nm.n, 'main', true, v_uid
  from _names nm
  where not exists (select 1 from stations st where st.name_en = nm.n);
  get diagnostics v_new_stations = row_count;

  /* خريطة الاسم → المحطة (المدموجة تُوجَّه لأساسيتها) */
  drop table if exists _st;
  create temp table _st on commit drop as
  select distinct on (s.name_en)
    s.name_en,
    coalesce(m.id, s.id)                     as id,
    coalesce(m.arrival_only, s.arrival_only) as arrival_only,
    coalesce(m.city_group, s.city_group)     as city_group
  from stations s
  left join stations m on m.id = s.merged_into
  where s.name_en is not null
  order by s.name_en, (s.merged_into is null) desc, s.is_active desc;

  /* 2) تعطيل الرحلات المختفية من الملف (بدون حذف — التاريخ محفوظ) */
  update trip_schedule ts set is_active = false
  where ts.is_active
    and not exists (select 1 from _file_trips f where f.code = ts.trip_number);
  get diagnostics v_off = row_count;

  /* 3) صفوف الرحلات بأنواع أعمدة الجدول الفعلية (jsonb_populate_record
        يتكفل بالتحويل الصحيح مهما كان نوع العمود time/text/enum) */
  drop table if exists _typed;
  create temp table _typed on commit drop as
  select (jsonb_populate_record(null::trip_schedule, jsonb_strip_nulls(jsonb_build_object(
    'trip_number',         f.code,
    'trip_name',           f.route,
    'route',               f.route,
    'scheduled_departure', f.start_time,
    'scheduled_arrival',   f.end_time,
    'dispatch_info',       f.dispatch_info,
    'dispatch_time',       f.dispatch_time,
    'schedule_period',     v_period,
    'bus_type',            f.bus_type,
    'from_station_id',     fs.id,
    'to_station_id',       te.id
  )))).* , true as _active
  from _file_trips f
  left join _st fs on fs.name_en = f.start_station
  left join _st te on te.name_en = f.end_station;

  /* تحديث الموجودة */
  update trip_schedule ts set
    trip_name           = t.trip_name,
    route               = t.route,
    scheduled_departure = t.scheduled_departure,
    scheduled_arrival   = t.scheduled_arrival,
    dispatch_info       = t.dispatch_info,
    dispatch_time       = t.dispatch_time,
    schedule_period     = t.schedule_period,
    bus_type            = t.bus_type,
    from_station_id     = t.from_station_id,
    to_station_id       = t.to_station_id,
    is_active           = true
  from _typed t
  where ts.trip_number = t.trip_number;
  get diagnostics v_updated = row_count;

  /* إضافة الجديدة */
  insert into trip_schedule
    (trip_number, trip_name, route, scheduled_departure, scheduled_arrival,
     dispatch_info, dispatch_time, schedule_period, bus_type,
     from_station_id, to_station_id, is_active)
  select t.trip_number, t.trip_name, t.route, t.scheduled_departure, t.scheduled_arrival,
         t.dispatch_info, t.dispatch_time, t.schedule_period, t.bus_type,
         t.from_station_id, t.to_station_id, true
  from _typed t
  where not exists (select 1 from trip_schedule x where x.trip_number = t.trip_number);
  get diagnostics v_added = row_count;

  /* 4) محطات العبور: حذف وإعادة لرحلات الملف فقط */
  delete from trip_schedule_stops st
  using trip_schedule t
  where st.trip_schedule_id = t.id
    and exists (select 1 from _file_trips f where f.code = t.trip_number);

  drop table if exists _stops_typed;
  create temp table _stops_typed on commit drop as
  select distinct on (t.id, ss.id)
    (jsonb_populate_record(null::trip_schedule_stops, jsonb_strip_nulls(jsonb_build_object(
      'trip_schedule_id', t.id,
      'station_id',       ss.id,
      'stop_order',       coalesce(sp.stop_order, 0),
      'arrival_time',     sp.arrival,
      'departure_time',   sp.departure,
      'status',           sp.status
    )))).*
  from _file_stops sp
  join trip_schedule t on t.trip_number = sp.code
  join _st ss          on ss.name_en    = sp.station
  order by t.id, ss.id, sp.stop_order;

  insert into trip_schedule_stops (trip_schedule_id, station_id, stop_order, arrival_time, departure_time, status)
  select trip_schedule_id, station_id, stop_order, arrival_time, departure_time, status
  from _stops_typed
  on conflict (trip_schedule_id, station_id) do update
    set stop_order = excluded.stop_order,
        arrival_time = excluded.arrival_time,
        departure_time = excluded.departure_time,
        status = excluded.status;
  get diagnostics v_stops = row_count;

  /* 5) ربط رحلات المحطات تلقائياً (منشأ/وجهة/عبور) — الموجود لا يُمس */
  drop table if exists _link_rows;
  create temp table _link_rows on commit drop as
  select distinct on (r.station_id, r.trip_schedule_id) r.*
  from (
    /* المنشأ (تُستثنى رحلات داخل نفس المدينة) */
    select 1 as ord, (jsonb_populate_record(null::station_trips, jsonb_strip_nulls(jsonb_build_object(
      'station_id', fs.id, 'trip_schedule_id', t.id,
      'dep_enabled', true, 'arr_enabled', true,
      'departure_time', left(f.start_time, 5),
      'selected_by', v_uid, 'selected_by_name', v_uname
    )))).*
    from _file_trips f
    join trip_schedule t on t.trip_number = f.code
    join _st fs on fs.name_en = f.start_station
    left join _st te on te.name_en = f.end_station
    where not (fs.city_group is not null and te.city_group = fs.city_group)

    union all
    /* الوجهة */
    select 2, (jsonb_populate_record(null::station_trips, jsonb_strip_nulls(jsonb_build_object(
      'station_id', te.id, 'trip_schedule_id', t.id,
      'dep_enabled', true, 'arr_enabled', true,
      'arrival_time', left(f.end_time, 5),
      'selected_by', v_uid, 'selected_by_name', v_uname
    )))).*
    from _file_trips f
    join trip_schedule t on t.trip_number = f.code
    join _st te on te.name_en = f.end_station
    left join _st fs on fs.name_en = f.start_station
    where not (fs.city_group is not null and te.city_group = fs.city_group)

    union all
    /* محطات العبور (محطة الوصول-فقط تُعطَّل مغادرتها) */
    select 3, (jsonb_populate_record(null::station_trips, jsonb_strip_nulls(jsonb_build_object(
      'station_id', ss.id, 'trip_schedule_id', t.id,
      'dep_enabled', not coalesce(ss.arrival_only, false), 'arr_enabled', true,
      'arrival_time', left(sp.arrival, 5), 'departure_time', left(sp.departure, 5),
      'selected_by', v_uid, 'selected_by_name', v_uname
    )))).*
    from _file_stops sp
    join trip_schedule t on t.trip_number = sp.code
    join _st ss on ss.name_en = sp.station
  ) r
  where r.station_id is not null and r.trip_schedule_id is not null
  order by r.station_id, r.trip_schedule_id, r.ord;

  insert into station_trips
    (station_id, trip_schedule_id, departure_station_id, dep_enabled, arr_enabled,
     departure_time, arrival_time, selected_by, selected_by_name)
  select station_id, trip_schedule_id, null,
         coalesce(dep_enabled, true), coalesce(arr_enabled, true),
         departure_time, arrival_time, selected_by, selected_by_name
  from _link_rows
  on conflict (station_id, trip_schedule_id) do nothing;

  /* 6) أرقام الرحلات الثابتة لكل محطة (إن وُجدت) */
  begin
    insert into station_trips
      (station_id, trip_schedule_id, departure_station_id, dep_enabled, arr_enabled, selected_by, selected_by_name)
    select s.id, t.id, null, true, true, v_uid, v_uname
    from stations s
    cross join lateral jsonb_array_elements_text(s.trip_numbers) num
    join trip_schedule t on t.trip_number = trim(num) and t.is_active
    where s.trip_numbers is not null and jsonb_typeof(s.trip_numbers) = 'array'
    on conflict (station_id, trip_schedule_id) do nothing;
  exception when others then null; -- عمود بنوع مختلف/غير موجود → تجاهل بأمان
  end;

  /* 7) سجل الرفع */
  insert into schedule_uploads
    (period, file_name, trip_count, station_count, start_date, end_date, status, uploaded_by, uploaded_by_name)
  values
    (v_period, file_name,
     jsonb_array_length(coalesce(payload->'trips','[]'::jsonb)),
     jsonb_array_length(coalesce(payload->'stations','[]'::jsonb)),
     start_date, end_date, 'applied', v_uid, v_uname);

  return jsonb_build_object(
    'period', v_period,
    'newStations', v_new_stations,
    'tripsAdded', v_added,
    'tripsUpdated', v_updated,
    'tripsDeactivated', v_off,
    'stops', v_stops
  );
end;
$$;

grant execute on function import_schedule(jsonb, text, date, date) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2) دمج محطة مكررة — ذرّي، ويرجع تقريراً جاهزاً للواجهة
-- ─────────────────────────────────────────────────────────────
create or replace function merge_stations_rpc(p_src uuid, p_dst uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid; v_uname text; v_role text;
  c int; r int; lf int;
  report jsonb := '[]'::jsonb;
begin
  select u.id, u.full_name_ar, u.role into v_uid, v_uname, v_role
  from users u where u.auth_id = auth.uid();
  if v_uid is null or v_role <> 'general_admin' then
    raise exception 'غير مصرح — الدمج للأدمن العام فقط';
  end if;
  if p_src is null or p_dst is null or p_src = p_dst then
    raise exception 'اختيار غير صالح';
  end if;

  /* 1) الرحلات: منشأ/وجهة */
  update trip_schedule set from_station_id = p_dst where from_station_id = p_src;
  get diagnostics c = row_count;
  report := report || jsonb_build_object('label','رحلات (منشأ)','ok',true,'moved',c);

  update trip_schedule set to_station_id = p_dst where to_station_id = p_src;
  get diagnostics c = row_count;
  report := report || jsonb_build_object('label','رحلات (وجهة)','ok',true,'moved',c);

  /* 2) محطات العبور — المتعارض يُحذف (موجود على الأساسية) */
  delete from trip_schedule_stops a
  where a.station_id = p_src
    and exists (select 1 from trip_schedule_stops b
                where b.station_id = p_dst and b.trip_schedule_id = a.trip_schedule_id);
  get diagnostics r = row_count;
  update trip_schedule_stops set station_id = p_dst where station_id = p_src;
  get diagnostics c = row_count;
  report := report || jsonb_build_object('label','محطات العبور','ok',true,'moved',c,'removed',r);

  /* 3) ربط الترحيل */
  delete from station_trips a
  where a.station_id = p_src
    and exists (select 1 from station_trips b
                where b.station_id = p_dst and b.trip_schedule_id = a.trip_schedule_id);
  get diagnostics r = row_count;
  update station_trips set station_id = p_dst where station_id = p_src;
  get diagnostics c = row_count;
  report := report || jsonb_build_object('label','رحلات الترحيل المفعّلة','ok',true,'moved',c,'removed',r);

  update station_trips set departure_station_id = p_dst where departure_station_id = p_src;
  get diagnostics c = row_count;
  report := report || jsonb_build_object('label','محطة مغادرة معدّلة','ok',true,'moved',c);

  /* 4) سجلات الرحلات — لا حذف: المتعارض يبقى ويُبلَّغ */
  update trip_records a set station_id = p_dst
  where a.station_id = p_src
    and not exists (select 1 from trip_records b
                    where b.station_id = p_dst
                      and b.trip_schedule_id = a.trip_schedule_id
                      and b.record_date = a.record_date);
  get diagnostics c = row_count;
  select count(*) into lf from trip_records where station_id = p_src;
  report := report || jsonb_build_object('label','سجلات الرحلات','ok',true,'moved',c,'left',lf);

  /* 5) سجلات العبور القديمة (إن وُجد الجدول) */
  begin
    update trip_transit_records a set station_id = p_dst
    where a.station_id = p_src
      and not exists (select 1 from trip_transit_records b
                      where b.station_id = p_dst and b.trip_record_id = a.trip_record_id);
    get diagnostics c = row_count;
    select count(*) into lf from trip_transit_records where station_id = p_src;
    report := report || jsonb_build_object('label','سجلات العبور','ok',true,'moved',c,'left',lf);
  exception when undefined_table then null;
  end;

  /* 6) المبيعات — لا حذف */
  update sales_records a set station_id = p_dst
  where a.station_id = p_src
    and not exists (select 1 from sales_records b
                    where b.station_id = p_dst
                      and b.sale_date = a.sale_date
                      and b.shift = a.shift
                      and b.created_by = a.created_by);
  get diagnostics c = row_count;
  select count(*) into lf from sales_records where station_id = p_src;
  report := report || jsonb_build_object('label','سجلات المبيعات','ok',true,'moved',c,'left',lf);

  /* 7) المفقودات + المستخدمون */
  update lost_found_items set station_id = p_dst where station_id = p_src;
  get diagnostics c = row_count;
  report := report || jsonb_build_object('label','المفقودات','ok',true,'moved',c);

  update users set station_id = p_dst where station_id = p_src;
  get diagnostics c = row_count;
  report := report || jsonb_build_object('label','المستخدمون (المحطة الأساسية)','ok',true,'moved',c);

  begin
    delete from user_stations a
    where a.station_id = p_src
      and exists (select 1 from user_stations b
                  where b.station_id = p_dst and b.user_id = a.user_id);
    get diagnostics r = row_count;
    update user_stations set station_id = p_dst where station_id = p_src;
    get diagnostics c = row_count;
    report := report || jsonb_build_object('label','محطات المستخدمين','ok',true,'moved',c,'removed',r);
  exception when undefined_table then null;
  end;

  /* 8) دمج أرقام الرحلات الثابتة ثم إقفال المكررة */
  begin
    update stations d set trip_numbers = (
      select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (
        select jsonb_array_elements_text(coalesce(d.trip_numbers,'[]'::jsonb)) as x
        union
        select jsonb_array_elements_text(coalesce(s.trip_numbers,'[]'::jsonb))
      ) t
    )
    from stations s
    where d.id = p_dst and s.id = p_src;
  exception when others then null;
  end;

  update stations set is_active = false where id = p_src;
  begin
    update stations set merged_into = p_dst where id = p_src;
  exception when undefined_column then null;
  end;
  report := report || jsonb_build_object('label','إقفال المحطة المكررة','ok',true,'moved',1);

  return report;
end;
$$;

grant execute on function merge_stations_rpc(uuid, uuid) to authenticated;

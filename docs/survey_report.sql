-- تقرير رضا العملاء: كل الحسابات (NPS، المتوسطات، حسب المحطة، الاتجاه الزمني، الشرائح) تتم بالقاعدة
-- بدل ما يجلب التطبيق آلاف الصفوف ويحسبها بالمتصفح. الدالة للأدمن غير المقيّد فقط.

create or replace function public.survey_report(
  p_from date, p_to date, p_kind text default null, p_station uuid default null
) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_from   timestamptz := p_from::timestamp at time zone 'Asia/Riyadh';
  v_to     timestamptz := (p_to + 1)::timestamp at time zone 'Asia/Riyadh';
  v_bucket text := case when (p_to - p_from) > 45 then 'week' else 'day' end;
  v_out    jsonb;
begin
  if not (is_admin() and not is_restricted()) then raise exception 'forbidden' using errcode = '42501'; end if;

  v_out := (
  with base as (
    select cs.*,
      case cs.kind when 'station' then cs.station_id else cs.from_station_id end as focus_id,
      (select avg(e.value::numeric) from jsonb_each_text(cs.ratings) e) as row_avg,
      (select min(e.value::numeric) from jsonb_each_text(cs.ratings) e) as row_min
    from customer_surveys cs
    where cs.created_at >= v_from and cs.created_at < v_to
      and (p_kind is null or cs.kind = p_kind)
      and (p_station is null or cs.station_id = p_station or cs.from_station_id = p_station or cs.to_station_id = p_station)
  ),
  vals as (
    select b.id, e.key, e.value::numeric as v from base b, jsonb_each_text(b.ratings) e
  )
  select jsonb_build_object(
    'total',    (select count(*) from base),
    'trips',    (select count(*) from base where kind = 'trip'),
    'low',      (select count(*) from base where row_min <= 2),
    'contacts', (select count(*) from base where contact_phone is not null),
    'comments', (select count(*) from base where comment is not null),
    'avg',      (select avg(v) from vals),
    'sat',      (select round(100.0 * count(*) filter (where v >= 4) / nullif(count(*), 0)) from vals),
    'nps', (select jsonb_build_object(
              'n',   count(nps),
              'pro', count(*) filter (where nps >= 9),
              'pas', count(*) filter (where nps between 7 and 8),
              'det', count(*) filter (where nps <= 6)) from base),
    'aspects', (select coalesce(jsonb_agg(jsonb_build_object('k', x.key, 'n', x.n, 'avg', x.a) order by x.a), '[]'::jsonb)
                from (select key, count(*) as n, avg(v) as a from vals group by key) x),
    'improve', (select coalesce(jsonb_agg(jsonb_build_object('k', x.k, 'n', x.n) order by x.n desc), '[]'::jsonb)
                from (select u.k, count(*) as n from base b, unnest(b.improve) as u(k) group by u.k) x),
    'reasons', (select coalesce(jsonb_agg(jsonb_build_object('k', x.k, 'n', x.n) order by x.n desc), '[]'::jsonb)
                from (select u.k, count(*) as n from base b, unnest(b.low_reason) as u(k) group by u.k) x),
    'stations', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', f.focus_id, 'name', coalesce(s.survey_name_ar, s.name_ar, s.name_en),
                    'n', f.n, 'avg', f.a, 'nps', f.nps, 'low', f.low) order by f.n desc), '[]'::jsonb)
                 from (select focus_id, count(*) as n, avg(row_avg) as a,
                              case when count(nps) > 0 then round(100.0 * (count(*) filter (where nps >= 9) - count(*) filter (where nps <= 6)) / count(nps)) end as nps,
                              round(100.0 * count(*) filter (where row_min <= 2) / count(*)) as low
                       from base where focus_id is not null group by focus_id) f
                 left join stations s on s.id = f.focus_id),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('d', t.d, 'n', t.n, 'avg', t.a, 'nps', t.nps) order by t.d), '[]'::jsonb)
              from (select (date_trunc(v_bucket, created_at at time zone 'Asia/Riyadh'))::date as d, count(*) as n, avg(row_avg) as a,
                           case when count(nps) > 0 then round(100.0 * (count(*) filter (where nps >= 9) - count(*) filter (where nps <= 6)) / count(nps)) end as nps
                    from base group by 1) t),
    'bucket', v_bucket,
    'age',      (select coalesce(jsonb_agg(jsonb_build_object('k', x.k, 'n', x.n, 'avg', x.a, 'nps', x.nps) order by x.n desc), '[]'::jsonb)
                 from (select age_group as k, count(*) as n, avg(row_avg) as a,
                              case when count(nps) > 0 then round(100.0 * (count(*) filter (where nps >= 9) - count(*) filter (where nps <= 6)) / count(nps)) end as nps
                       from base where age_group is not null group by age_group) x),
    'traveler', (select coalesce(jsonb_agg(jsonb_build_object('k', x.k, 'n', x.n, 'avg', x.a, 'nps', x.nps) order by x.n desc), '[]'::jsonb)
                 from (select traveler_type as k, count(*) as n, avg(row_avg) as a,
                              case when count(nps) > 0 then round(100.0 * (count(*) filter (where nps >= 9) - count(*) filter (where nps <= 6)) / count(nps)) end as nps
                       from base where traveler_type is not null group by traveler_type) x),
    'purpose',  (select coalesce(jsonb_agg(jsonb_build_object('k', x.k, 'n', x.n, 'avg', x.a, 'nps', x.nps) order by x.n desc), '[]'::jsonb)
                 from (select trip_purpose as k, count(*) as n, avg(row_avg) as a,
                              case when count(nps) > 0 then round(100.0 * (count(*) filter (where nps >= 9) - count(*) filter (where nps <= 6)) / count(nps)) end as nps
                       from base where trip_purpose is not null group by trip_purpose) x),
    'freq',     (select coalesce(jsonb_agg(jsonb_build_object('k', x.k, 'n', x.n, 'avg', x.a, 'nps', x.nps) order by x.n desc), '[]'::jsonb)
                 from (select frequency as k, count(*) as n, avg(row_avg) as a,
                              case when count(nps) > 0 then round(100.0 * (count(*) filter (where nps >= 9) - count(*) filter (where nps <= 6)) / count(nps)) end as nps
                       from base where frequency is not null group by frequency) x),
    'langs',    (select coalesce(jsonb_agg(jsonb_build_object('k', x.k, 'n', x.n) order by x.n desc), '[]'::jsonb)
                 from (select coalesce(lang, '?') as k, count(*) as n from base group by 1) x)
  ));

  return v_out;
end $$;

revoke all on function public.survey_report(date, date, text, uuid) from public, anon;
grant execute on function public.survey_report(date, date, text, uuid) to authenticated;

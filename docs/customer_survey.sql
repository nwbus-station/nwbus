-- استبيان العملاء (QR موحّد بالحافلات): جزءان — تقييم الرحلة وتقييم المحطة
-- الإرسال عام بدون تسجيل دخول عبر دالة محكمة (تتحقق من كل شي)، والقراءة للأدمن غير المقيّد فقط

create table if not exists public.customer_surveys (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  kind            text not null check (kind in ('trip', 'station')),
  lang            text,
  station_id      uuid references public.stations(id) on delete set null,       -- المحطة المقيَّمة (kind=station)
  from_station_id uuid references public.stations(id) on delete set null,       -- محطة الركوب (kind=trip)
  to_station_id   uuid references public.stations(id) on delete set null,       -- محطة الوجهة (kind=trip)
  trip_number     text,
  nps             smallint check (nps between 0 and 10),
  ratings         jsonb not null default '{}'::jsonb,                           -- {جانب: 1..5}
  improve         text[] not null default '{}',                                 -- أكثر ما يحتاج تحسين
  low_reason      text[] not null default '{}',                                 -- سبب التقييم المنخفض
  comment         text,
  age_group       text,
  traveler_type   text,
  trip_purpose    text,
  frequency       text,
  contact_phone   text,
  device_hash     text
);

create index if not exists customer_surveys_created_idx on public.customer_surveys (created_at desc);
create index if not exists customer_surveys_station_idx on public.customer_surveys (station_id);
create index if not exists customer_surveys_from_idx    on public.customer_surveys (from_station_id);

alter table public.customer_surveys enable row level security;

drop policy if exists "cs_admin_select" on public.customer_surveys;
create policy "cs_admin_select" on public.customer_surveys
  for select using (is_admin() and not is_restricted());

drop policy if exists "cs_admin_delete" on public.customer_surveys;
create policy "cs_admin_delete" on public.customer_surveys
  for delete using (is_admin() and not is_restricted());

revoke all on public.customer_surveys from anon;
grant select, delete on public.customer_surveys to authenticated;

-- إرسال استبيان (عام): تحقق من القيم + منع التكرار من نفس الجهاز خلال 20 دقيقة
create or replace function public.submit_customer_survey(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_kind    text  := p->>'kind';
  v_nps     int   := nullif(p->>'nps', '')::int;
  v_ratings jsonb := coalesce(p->'ratings', '{}'::jsonb);
  v_dev     text  := left(coalesce(p->>'device', ''), 64);
  k text; v jsonb; n numeric;
begin
  if v_kind is null or v_kind not in ('trip', 'station') then raise exception 'invalid kind'; end if;
  if v_nps is not null and (v_nps < 0 or v_nps > 10) then raise exception 'invalid nps'; end if;
  if jsonb_typeof(v_ratings) <> 'object' then raise exception 'invalid ratings'; end if;
  if (select count(*) from jsonb_object_keys(v_ratings)) > 12 then raise exception 'too many ratings'; end if;
  for k, v in select * from jsonb_each(v_ratings) loop
    if jsonb_typeof(v) <> 'number' then raise exception 'invalid rating'; end if;
    n := (v #>> '{}')::numeric;
    if n < 1 or n > 5 or n <> floor(n) then raise exception 'invalid rating'; end if;
    if length(k) > 30 then raise exception 'invalid rating key'; end if;
  end loop;
  if v_nps is null and v_ratings = '{}'::jsonb then raise exception 'empty survey'; end if;

  if v_dev <> '' and exists (
    select 1 from customer_surveys
    where device_hash = v_dev and kind = v_kind and created_at > now() - interval '20 minutes'
  ) then raise exception 'duplicate'; end if;

  insert into customer_surveys (
    kind, lang, station_id, from_station_id, to_station_id, trip_number, nps, ratings,
    improve, low_reason, comment, age_group, traveler_type, trip_purpose, frequency, contact_phone, device_hash
  ) values (
    v_kind, left(p->>'lang', 5),
    nullif(p->>'station_id', '')::uuid, nullif(p->>'from_station_id', '')::uuid, nullif(p->>'to_station_id', '')::uuid,
    left(nullif(trim(p->>'trip_number'), ''), 20), v_nps, v_ratings,
    coalesce(array(select left(x, 40) from jsonb_array_elements_text(coalesce(p->'improve', '[]'::jsonb)) x limit 8), '{}'),
    coalesce(array(select left(x, 40) from jsonb_array_elements_text(coalesce(p->'low_reason', '[]'::jsonb)) x limit 10), '{}'),
    left(nullif(trim(p->>'comment'), ''), 1000),
    left(p->>'age_group', 20), left(p->>'traveler_type', 30), left(p->>'trip_purpose', 30), left(p->>'frequency', 20),
    left(nullif(trim(p->>'contact_phone'), ''), 20), nullif(v_dev, '')
  );
end $$;

revoke all on function public.submit_customer_survey(jsonb) from public;
grant execute on function public.submit_customer_survey(jsonb) to anon, authenticated;

-- قائمة المحطات للصفحة العامة (أسماء فقط) — بدون فتح جدول المحطات للزوار
create or replace function public.survey_stations()
returns table (id uuid, name_ar text, name_en text, city_group text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name_ar, s.name_en, s.city_group
  from stations s
  where s.merged_into is null
    and coalesce(s.is_active, true)
    and coalesce(s.name_ar, '') not ilike '%only rest%'
    and coalesce(s.name_en, '') not ilike '%only rest%'
  order by s.name_ar
$$;

revoke all on function public.survey_stations() from public;
grant execute on function public.survey_stations() to anon, authenticated;

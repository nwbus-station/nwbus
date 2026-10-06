-- وقت فتح الاستبيان (بجانب وقت الإرسال) لمعرفة وقت الدخول ومدة التعبئة
alter table public.customer_surveys add column if not exists opened_at timestamptz;

create or replace function public.submit_customer_survey(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_kind    text  := p->>'kind';
  v_nps     int   := nullif(p->>'nps', '')::int;
  v_ratings jsonb := coalesce(p->'ratings', '{}'::jsonb);
  v_dev     text  := left(coalesce(p->>'device', ''), 64);
  v_hdr     jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip      text  := trim(split_part(coalesce(v_hdr->>'x-forwarded-for', ''), ',', 1));
  v_iph     text  := case when v_ip = '' then null else md5(v_ip || ':nwbus-survey') end;
  v_opened  timestamptz;
  k text; v jsonb; n numeric;
begin
  -- وقت فتح الاستبيان من المتصفح: نقبله فقط لو معقول (آخر 6 ساعات وما هو بالمستقبل)
  begin
    v_opened := nullif(p->>'opened_at', '')::timestamptz;
  exception when others then
    v_opened := null;
  end;
  if v_opened is not null and (v_opened > now() or v_opened < now() - interval '6 hours') then v_opened := null; end if;
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

  -- المحطات والحافلات تشارك IP واحد أحياناً، فالحد سخي (40 بالساعة) ويوقف الإرسال الآلي فقط
  if v_iph is not null and (
    select count(*) from customer_surveys where ip_hash = v_iph and created_at > now() - interval '1 hour'
  ) >= 40 then raise exception 'rate limited'; end if;

  insert into customer_surveys (
    kind, lang, station_id, from_station_id, to_station_id, trip_number, nps, ratings,
    improve, low_reason, comment, age_group, traveler_type, trip_purpose, frequency, contact_phone, device_hash, ip_hash, opened_at
  ) values (
    v_kind, left(p->>'lang', 5),
    nullif(p->>'station_id', '')::uuid, nullif(p->>'from_station_id', '')::uuid, nullif(p->>'to_station_id', '')::uuid,
    left(nullif(trim(p->>'trip_number'), ''), 20), v_nps, v_ratings,
    coalesce(array(select left(x, 40) from jsonb_array_elements_text(coalesce(p->'improve', '[]'::jsonb)) x limit 8), '{}'),
    coalesce(array(select left(x, 40) from jsonb_array_elements_text(coalesce(p->'low_reason', '[]'::jsonb)) x limit 10), '{}'),
    left(nullif(trim(p->>'comment'), ''), 1000),
    left(p->>'age_group', 20), left(p->>'traveler_type', 30), left(p->>'trip_purpose', 30), left(p->>'frequency', 20),
    left(nullif(trim(p->>'contact_phone'), ''), 20), nullif(v_dev, ''), v_iph, v_opened
  );
end $$;

revoke all on function public.submit_customer_survey(jsonb) from public;
grant execute on function public.submit_customer_survey(jsonb) to anon, authenticated;

-- ورديات المحطة المتوقفة + إقرار المشرف بالنواقص (إيراد وردية / رحلات لم تُدخل).
-- شغّل كل كتلة (مفصولة بسطر ═══) بشكل منفصل، بالترتيب.

-- ═════ 1) الورديات المتوقفة في المحطة (مثل {A} أو {A,C}) — لا تدخل في نسب الأداء ولا في تنبيهات النواقص ═════
alter table public.stations add column if not exists inactive_shifts text[] not null default '{}';
alter table public.stations drop constraint if exists stations_inactive_shifts_chk;
alter table public.stations add constraint stations_inactive_shifts_chk check (inactive_shifts <@ array['A','B','C','D']::text[]);

-- ═════ 2) إقرارات المشرفين بالنواقص: «علمتُ بهذا النقص» باسمه ووقته (بقاؤه ظاهراً حتى يُصلَح) ═════
create table if not exists public.shortfall_acks (
  id          uuid primary key default gen_random_uuid(),
  station_id  uuid not null references public.stations(id) on delete cascade,
  kind        text not null check (kind in ('sales', 'trips')),
  day         date not null,
  shift       text not null default '',
  ack_by      uuid references public.users(id) on delete set null,
  ack_by_name text not null default '',
  ack_at      timestamptz not null default now(),
  unique (station_id, kind, day, shift)
);
create index if not exists idx_shortfall_acks_day on public.shortfall_acks(day desc);
alter table public.shortfall_acks enable row level security;
revoke all on public.shortfall_acks from public, anon, authenticated;

-- ═════ 3) صلاحية الوصول للمحطة (الأدمن/المدير: الكل — غيرهم: محطته الأساسية أو المربوطة به) ═════
create or replace function public.shortfall_can(p_station uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select u.role::text in ('general_admin', 'stations_executive_director', 'assistant_stations_executive_director')
        or u.station_id = p_station
        or exists (select 1 from public.user_stations us where us.user_id = u.id and us.station_id = p_station)
    from public.users u where u.auth_id = auth.uid() and u.is_active limit 1), false)
$$;
revoke all on function public.shortfall_can(uuid) from public, anon;
grant execute on function public.shortfall_can(uuid) to authenticated;

-- ═════ 4) تسجيل الإقرار (أول إقرار يُحفظ ولا يُستبدل) ═════
create or replace function public.shortfall_ack(p_station uuid, p_kind text, p_day date, p_shift text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.users; r public.shortfall_acks;
begin
  if p_kind not in ('sales', 'trips') then raise exception 'bad kind'; end if;
  if not public.shortfall_can(p_station) then raise exception 'not allowed'; end if;
  select * into me from public.users where auth_id = auth.uid() and is_active limit 1;
  insert into public.shortfall_acks(station_id, kind, day, shift, ack_by, ack_by_name)
  values (p_station, p_kind, p_day, coalesce(p_shift, ''), me.id, coalesce(me.full_name_ar, ''))
  on conflict (station_id, kind, day, shift) do nothing;
  select * into r from public.shortfall_acks where station_id = p_station and kind = p_kind and day = p_day and shift = coalesce(p_shift, '');
  return jsonb_build_object('station_id', r.station_id, 'kind', r.kind, 'day', r.day, 'shift', r.shift, 'ack_by_name', r.ack_by_name, 'ack_at', r.ack_at);
end $$;
revoke all on function public.shortfall_ack(uuid, text, date, text) from public, anon;
grant execute on function public.shortfall_ack(uuid, text, date, text) to authenticated;

-- ═════ 5) قراءة الإقرارات (للمشرف: محطاته — وللأدمن: الكل) ═════
create or replace function public.shortfall_acks_list(p_stations uuid[] default null, p_from date default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('station_id', a.station_id, 'kind', a.kind, 'day', a.day, 'shift', a.shift, 'ack_by_name', a.ack_by_name, 'ack_at', a.ack_at)
         order by a.day desc, a.ack_at desc), '[]'::jsonb)
  from public.shortfall_acks a
  where (p_stations is null or a.station_id = any (p_stations))
    and public.shortfall_can(a.station_id)
    and (p_from is null or a.day >= p_from)
$$;
revoke all on function public.shortfall_acks_list(uuid[], date) from public, anon;
grant execute on function public.shortfall_acks_list(uuid[], date) to authenticated;

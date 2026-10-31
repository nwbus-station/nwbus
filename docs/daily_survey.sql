-- التقييم اليومي الإلزامي للركاب: جدول التقدّم + دالة التحقق من وصول تقييم جديد
create table if not exists public.user_daily_survey (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  done int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.user_daily_survey enable row level security;
drop policy if exists "uds_own" on public.user_daily_survey;
create policy "uds_own" on public.user_daily_survey for all
  using (user_id = current_user_id() or is_admin())
  with check (user_id = current_user_id());

create or replace function public.survey_count_since(p_since timestamptz) returns int
language sql security definer set search_path = public as $$
  with me as (select station_id from users where auth_id = auth.uid() limit 1),
  ids as (
    select s.id from stations s
    where s.id = (select station_id from me)
       or (s.survey_city is not null and s.survey_city = (select survey_city from stations where id = (select station_id from me)))
  )
  select count(*)::int from customer_surveys cs
  where cs.created_at >= p_since
    and (cs.station_id in (select id from ids) or cs.from_station_id in (select id from ids) or cs.to_station_id in (select id from ids));
$$;
grant execute on function public.survey_count_since(timestamptz) to authenticated;

-- سجل تفصيلي لكل تقييم يحتسبه الموظف (للتقرير: من قيّم، أي محطة، النتيجة، الوقت)
create table if not exists public.user_survey_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  station_id uuid references public.stations(id) on delete set null,
  rating smallint check (rating between 1 and 5),
  created_at timestamptz not null default now()
);
create index if not exists user_survey_events_day_idx on public.user_survey_events (day);
alter table public.user_survey_events enable row level security;
drop policy if exists "use_insert_own" on public.user_survey_events;
create policy "use_insert_own" on public.user_survey_events for insert to authenticated with check (user_id = current_user_id());
drop policy if exists "use_select" on public.user_survey_events;
create policy "use_select" on public.user_survey_events for select to authenticated using (user_id = current_user_id() or is_admin());
drop policy if exists "use_delete_admin" on public.user_survey_events;
create policy "use_delete_admin" on public.user_survey_events for delete to authenticated using (is_admin());

-- سجل تغييرات الإعدادات: من غيّر أي إعداد (مثل مفتاح التقييم اليومي) ومتى
create table if not exists public.app_settings_log (
  id bigint generated always as identity primary key,
  key text not null,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz not null default now()
);
alter table public.app_settings_log enable row level security;
drop policy if exists "asl_admin_select" on public.app_settings_log;
create policy "asl_admin_select" on public.app_settings_log for select to authenticated using (is_admin());
grant select on public.app_settings_log to authenticated;
grant select, insert, update, delete on public.app_settings_log to service_role;

create or replace function public.log_app_settings() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid; nm text;
begin
  select u.id, u.full_name_ar into uid, nm from users u where u.auth_id = auth.uid() limit 1;
  if tg_op = 'INSERT' or new.value::text is distinct from old.value::text then
    insert into app_settings_log(key, old_value, new_value, changed_by, changed_by_name)
    values (new.key, case when tg_op = 'UPDATE' then old.value::text end, new.value::text, uid, nm);
  end if;
  return new;
end $$;
drop trigger if exists trg_log_app_settings on public.app_settings;
create trigger trg_log_app_settings after insert or update on public.app_settings for each row execute function public.log_app_settings();

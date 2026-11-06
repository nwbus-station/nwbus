-- اتصال Excel المباشر (للأدمن العام فقط): مفاتيح قراءة فقط + دالة بيانات.
-- شغّل كل جزء بشكل منفصل في Supabase SQL Editor.

-- ═════ 1) جدول المفاتيح (لا يصله أحد مباشرة؛ الوصول عبر الدوال فقط) ═════
create table if not exists public.excel_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  label        text not null default '',
  token_hash   text not null unique,          -- لا نخزّن المفتاح نفسه، فقط بصمته
  token_hint   text not null,                 -- آخر 4 أحرف للتمييز
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  use_count    integer not null default 0
);

alter table public.excel_keys enable row level security;
revoke all on public.excel_keys from anon, authenticated;
grant all on public.excel_keys to service_role;

-- ═════ 2) إنشاء مفتاح (أدمن عام فقط) — يرجع المفتاح مرة واحدة ═════
create or replace function public.create_excel_key(p_label text, p_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  tok text;
  exp timestamptz;
begin
  select id into uid from users where auth_id = auth.uid() and role = 'general_admin' and is_active;
  if uid is null then raise exception 'not allowed'; end if;
  if p_days is null or p_days < 1 or p_days > 365 then p_days := 90; end if;
  tok := 'nwx_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  exp := now() + make_interval(days => p_days);
  insert into excel_keys (user_id, label, token_hash, token_hint, expires_at)
  values (uid, left(coalesce(p_label, ''), 60), encode(sha256(convert_to(tok, 'UTF8')), 'hex'), right(tok, 4), exp);
  return jsonb_build_object('token', tok, 'expires_at', exp);
end;
$$;

-- ═════ 3) قائمة المفاتيح وإلغاء مفتاح ═════
create or replace function public.list_excel_keys()
returns table (id uuid, label text, token_hint text, created_at timestamptz, expires_at timestamptz,
               revoked_at timestamptz, last_used_at timestamptz, use_count integer, owner_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from users where auth_id = auth.uid() and role = 'general_admin' and is_active) then
    raise exception 'not allowed';
  end if;
  return query
    select k.id, k.label, k.token_hint, k.created_at, k.expires_at, k.revoked_at, k.last_used_at, k.use_count, u.full_name_ar
    from excel_keys k join users u on u.id = k.user_id
    order by k.created_at desc;
end;
$$;

create or replace function public.revoke_excel_key(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from users where auth_id = auth.uid() and role = 'general_admin' and is_active) then
    raise exception 'not allowed';
  end if;
  update excel_keys set revoked_at = now() where id = p_id and revoked_at is null;
end;
$$;

-- ═════ 4) دالة البيانات (يستدعيها Excel بالمفتاح) ═════
create or replace function public.excel_feed(p_token text, p_dataset text, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
as $$
declare
  k excel_keys%rowtype;
  cfg record;
  cols text[];
  c text;
  datecol text;
  lo date := coalesce(p_from, current_date - 365);
  hi date := coalesce(p_to, current_date + 31);
  expr text := 'to_jsonb(t)';
  wh text := '';
  ord text := '';
  res jsonb;
begin
  -- التحقق من المفتاح: موجود، غير ملغى، غير منتهٍ، وصاحبه أدمن عام فعّال
  select * into k from excel_keys
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and revoked_at is null and expires_at > now();
  if not found then raise exception 'invalid key' using errcode = '28000'; end if;
  if not exists (select 1 from users u where u.id = k.user_id and u.role = 'general_admin' and u.is_active) then
    raise exception 'invalid key' using errcode = '28000';
  end if;
  update excel_keys set last_used_at = now(), use_count = use_count + 1 where id = k.id;

  -- قائمة البيانات المسموحة فقط (اسم → جدول → أعمدة التاريخ المرشَّحة بالترتيب)
  select * into cfg from (values
    ('sales',            'sales_records',          array['sale_date']),
    ('trips',            'trip_records',           array['record_date']),
    ('leaves',           'leaves',                 array['start_date','from_date','created_at']),
    ('evaluations',      'employee_evaluations',   array['evaluation_date','eval_date','created_at']),
    ('supervisor_evals', 'supervisor_evaluations', array['evaluation_date','eval_date','created_at']),
    ('station_evals',    'station_evaluations',    array['evaluation_date','eval_date','created_at']),
    ('customer_ratings', 'customer_ratings',       array['created_at']),
    ('customer_surveys', 'customer_surveys',       array['created_at']),
    ('lost_found',       'lost_found_items',       array['found_date','created_at']),
    ('lost_reports',     'lost_reports',           array['created_at']),
    ('daily_survey',     'user_daily_survey',      array['survey_date','created_at']),
    ('audit',            'audit_log',              array['created_at']),
    ('employees',        'users',                  array[]::text[]),
    ('stations',         'stations',               array[]::text[]),
    ('schedule',         'trip_schedule',          array[]::text[])
  ) as t(ds, tbl, datecols) where t.ds = p_dataset;
  if not found then raise exception 'unknown dataset'; end if;
  if to_regclass('public.' || cfg.tbl) is null then return '[]'::jsonb; end if;   -- الجدول غير موجود بعد

  select array_agg(column_name::text) into cols
    from information_schema.columns where table_schema = 'public' and table_name = cfg.tbl;

  -- عمود التاريخ: أول عمود موجود من الترشيحات
  foreach c in array cfg.datecols loop
    if c = any(cols) then datecol := c; exit; end if;
  end loop;
  if datecol is not null then
    wh  := format('where (t.%I)::date between %L and %L', datecol, lo, hi);
    ord := format('order by t.%I desc', datecol);
  end if;

  -- الموظفون: أعمدة آمنة فقط (بدون بيانات الدخول أو المعرّفات الشخصية)
  if p_dataset = 'employees' then
    expr := $e$(select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(to_jsonb(t))
                 where key = any(array['id','full_name_ar','full_name_en','role','station_id','is_active','job_number','job_title','custom_title_id','created_at','last_login']))$e$;
  end if;

  -- إثراء الصفوف بأسماء المحطات والموظفين والرحلة (مفاتيح ثابتة حتى لو القيمة فارغة)
  if 'station_id' = any(cols) then
    expr := expr || $e$ || coalesce((select jsonb_build_object('station_name', coalesce(nullif(s.name_ar, ''), s.name_en))
                                     from public.stations s where s.id::text = to_jsonb(t)->>'station_id'),
                                    jsonb_build_object('station_name', null))$e$;
  end if;
  if 'trip_schedule_id' = any(cols) then
    expr := expr || $e$ || coalesce((select jsonb_build_object('trip_number', ts.trip_number, 'scheduled_departure', ts.scheduled_departure,
                                            'from_station', coalesce(nullif(fs.name_ar, ''), fs.name_en), 'to_station', coalesce(nullif(tn.name_ar, ''), tn.name_en))
                                     from public.trip_schedule ts
                                     left join public.stations fs on fs.id = ts.from_station_id
                                     left join public.stations tn on tn.id = ts.to_station_id
                                     where ts.id::text = to_jsonb(t)->>'trip_schedule_id'),
                                    jsonb_build_object('trip_number', null, 'scheduled_departure', null, 'from_station', null, 'to_station', null))$e$;
  end if;
  if p_dataset <> 'employees' then
    foreach c in array array['user_id','employee_id','created_by','evaluator_id','supervisor_id','evaluated_by','approved_by'] loop
      if c = any(cols) then
        expr := expr || format($e$ || coalesce((select jsonb_build_object(%L, u.full_name_ar, %L, u.job_number)
                                                from public.users u where u.id::text = to_jsonb(t)->>%L),
                                               jsonb_build_object(%L, null, %L, null))$e$, c || '_name', c || '_job', c, c || '_name', c || '_job');
      end if;
    end loop;
  end if;

  execute format('select coalesce(jsonb_agg(x.j), ''[]''::jsonb) from (select %s as j from public.%I t %s %s limit 200000) x',
                 expr, cfg.tbl, wh, ord)
     into res;
  return res;
end;
$$;

-- ═════ 5) الصلاحيات: الدالة تُستدعى بالمفتاح (anon)، وإدارة المفاتيح للمسجَّلين (والدالة نفسها تتحقق من الأدمن) ═════
revoke all on function public.create_excel_key(text, integer) from public;
revoke all on function public.list_excel_keys() from public;
revoke all on function public.revoke_excel_key(uuid) from public;
revoke all on function public.excel_feed(text, text, date, date) from public;
grant execute on function public.create_excel_key(text, integer) to authenticated;
grant execute on function public.list_excel_keys() to authenticated;
grant execute on function public.revoke_excel_key(uuid) to authenticated;
grant execute on function public.excel_feed(text, text, date, date) to anon, authenticated;

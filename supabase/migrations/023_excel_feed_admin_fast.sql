-- تسريع مركز البيانات: إزالة الإثراء لكل صف من الدالة (يتم الآن في المتصفح). الصلاحيات الحالية تبقى كما هي.
-- شغّل الدالة فقط في Supabase SQL Editor.

create or replace function public.excel_feed_admin(p_dataset text, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
as $$
declare
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
  -- للأدمن العام المسجَّل فقط (بدون مفتاح): الجلسة نفسها تُثبت الهوية
  if not exists (select 1 from users u where u.auth_id = auth.uid() and u.role = 'general_admin' and u.is_active) then
    raise exception 'not allowed' using errcode = '28000';
  end if;

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
    ('schedule',         'trip_schedule',          array[]::text[]),
    ('station_trips',    'station_trips',          array[]::text[]),
    ('schedule_stops',   'trip_schedule_stops',    array[]::text[]),
    ('shipments',        'shipments',              array['created_at']),
    ('charity',          'charity_donations',      array['created_at']),
    ('magazine',         'magazine_posts',         array['created_at']),
    ('rating_messages',  'station_rating_messages',array['created_at']),
    ('survey_cities',    'survey_cities',          array[]::text[]),
    ('titles',           'custom_titles',          array[]::text[]),
    ('supervisor_assign','shift_supervisor_assignments', array[]::text[]),
    ('user_stations',    'user_stations',          array[]::text[]),
    ('schedule_uploads', 'schedule_uploads',       array['created_at'])
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

  -- الربط بأسماء المحطات والموظفين يتم في المتصفح (أسرع بكثير من بحث لكل صف هنا)

  execute format('select coalesce(jsonb_agg(x.j), ''[]''::jsonb) from (select %s as j from public.%I t %s %s limit 200000) x',
                 expr, cfg.tbl, wh, ord)
     into res;
  return res;
end;
$$;

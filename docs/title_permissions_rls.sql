-- ============================================================
-- تطبيق صلاحيات المسميات المخصصة على مستوى قاعدة البيانات (RLS)
-- الفكرة: سياسات RESTRICTIVE تُضاف فوق السياسات الحالية ولا تمس أحداً غير أصحاب "الحساب المقيّد"
-- (مثل مشرف المرحلين). أي مستخدم آخر (بما فيهم الأدمن العام) is_restricted() = false فتمر كل السياسات كما هي.
-- إضافة فقط — لا يتغير شي على الحسابات الحالية.
-- ============================================================

-- ─── دوال مساعدة ───────────────────────────────────────────

-- هل الحساب الحالي "مقيّد" (مسمى مخصص بأساس أدمن ووضع مقيّد)؟
create or replace function is_restricted()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select (t.permissions->>'restricted_mode')::boolean
    from users u join custom_titles t on t.id = u.custom_title_id
    where u.auth_id = auth.uid()
      and u.role::text in ('general_admin', 'stations_executive_director', 'assistant_stations_executive_director')
  ), false)
$$;

-- صلاحية من مصفوفة المسمى (dflt = القيمة لو ما حُددت: true للقيود، false للمنح)
create or replace function title_cap(k text, dflt boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select (t.permissions->>k)::boolean
    from users u join custom_titles t on t.id = u.custom_title_id
    where u.auth_id = auth.uid()
  ), dflt)
$$;

-- هل القسم ضمن الأقسام المتاحة للحساب الحالي؟ (allowed_modules فارغ = كل الأقسام)
create or replace function title_module(k text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select (u.allowed_modules is null) or (k = any(u.allowed_modules))
    from users u where u.auth_id = auth.uid()
  ), false)
$$;

-- رقم جوال مرحّل: للأدمن العام، أو للمسمى المقيّد اللي عنده "كل المرحّلين"
create or replace function get_dispatcher_phone(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select u.phone from users u
  where u.id = p_id and u.job_title = 'dispatcher'
    and ((is_admin() and not is_restricted()) or (is_restricted() and title_cap('all_dispatchers', false)))
$$;


-- ملاحظة مهمة: السياسات ما تستعلم من جداول محمية مباشرة (يسبب infinite recursion) — كل شي عبر دوال SECURITY DEFINER

-- موظفوه المحددون
create or replace function my_assigned_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(employee_id), '{}'::uuid[])
  from shift_supervisor_assignments where supervisor_id = current_user_id()
$$;

-- هل هذا الموظف مرحّل؟
create or replace function is_dispatcher_user(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = uid and job_title = 'dispatcher')
$$;

-- محطته الأساسية
create or replace function my_primary_station()
returns uuid language sql stable security definer set search_path = public as $$
  select station_id from users where auth_id = auth.uid()
$$;

-- هل المحطة ضمن نطاقه؟ (لو ما فعّل "يقتصر على محطاته" فالنطاق مفتوح)
create or replace function in_scope(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not title_cap('scope_assigned_stations', false)
      or sid = any(my_station_ids())
      or sid = my_primary_station()
$$;

-- هل الرحلة رحلة إضافية (RF)؟
create or replace function trip_is_rf(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_rf from trip_schedule where id = tid), false)
$$;

-- رمي خطأ لو الحساب مقيّد (تُستخدم لحماية دوال الأدمن)
create or replace function assert_not_restricted()
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  if is_restricted() then
    raise exception 'ليس لديك صلاحية لهذا الإجراء' using errcode = '42501';
  end if;
  return true;
end
$$;

grant execute on function my_assigned_ids() to authenticated;
grant execute on function is_dispatcher_user(uuid) to authenticated;
grant execute on function my_primary_station() to authenticated;
grant execute on function in_scope(uuid) to authenticated;
grant execute on function trip_is_rf(uuid) to authenticated;
grant execute on function assert_not_restricted() to authenticated;

grant execute on function is_restricted() to authenticated;
grant execute on function title_cap(text, boolean) to authenticated;
grant execute on function title_module(text) to authenticated;
grant execute on function get_dispatcher_phone(uuid) to authenticated;

-- ─── سياسات RESTRICTIVE ─────────────────────────────────────
-- (تُضاف فوق السياسات الحالية بـ AND، وتنطبق فقط لما is_restricted() = true)

-- ملاحظة: الأدوار المقيّدة هنا أساسها أدمن، فسياسات is_admin() الحالية تسمح لهم، وهذي السياسات تضيّقها.

-- الموظفون: نفسه، محطاته، المرحّلين (لو "كل المرحّلين")، وموظفوه المحددون
drop policy if exists "rst_users_select" on users;
create policy "rst_users_select" on users as restrictive for select to authenticated using (
  not is_restricted()
  or id = current_user_id()
  or station_id = any(my_station_ids())
  or station_id = my_primary_station()
  or (title_cap('all_dispatchers', false) and job_title = 'dispatcher')
  or id = any(my_assigned_ids())
  or role::text in ('general_admin','stations_executive_director','assistant_stations_executive_director')  -- أسماء الأدمن (للإشعارات وطلبات الإجازة)
);
drop policy if exists "rst_users_update" on users;
create policy "rst_users_update" on users as restrictive for update to authenticated
  using (not is_restricted() or id = current_user_id());
drop policy if exists "rst_users_insert" on users;
create policy "rst_users_insert" on users as restrictive for insert to authenticated with check (not is_restricted());
drop policy if exists "rst_users_delete" on users;
create policy "rst_users_delete" on users as restrictive for delete to authenticated using (not is_restricted());

-- الإجازات
drop policy if exists "rst_leaves_all" on leaves;
create policy "rst_leaves_all" on leaves as restrictive for all to authenticated using (
  not is_restricted()
  or employee_id = current_user_id()
  or (title_cap('all_dispatchers', false) and (job_title = 'dispatcher' or is_dispatcher_user(employee_id)))
  or employee_id = any(my_assigned_ids())
  or (title_cap('leaves_supervisor_stage', false) and (station_id = any(my_station_ids()) or station_id = my_primary_station()))
);
-- الاعتماد النهائي للإجازات يبقى للأدمن فقط لو ما مُنح المسمى "الاعتماد النهائي"
-- (التحكم فيه بالواجهة + السياسة أعلاه تحصر النطاق)

-- التقييمات
drop policy if exists "rst_emp_evals_all" on employee_evaluations;
create policy "rst_emp_evals_all" on employee_evaluations as restrictive for all to authenticated using (
  not is_restricted()
  or evaluator_id = current_user_id()
  or employee_id = current_user_id()
  or (title_cap('all_dispatchers', false) and is_dispatcher_user(employee_id))
  or employee_id = any(my_assigned_ids())
);
drop policy if exists "rst_sup_evals_all" on supervisor_evaluations;
create policy "rst_sup_evals_all" on supervisor_evaluations as restrictive for all to authenticated using (
  not is_restricted()
  or (evaluator_id = current_user_id() and title_cap('evaluation_supervisors_tab', true))
  or supervisor_id = current_user_id()
);
drop policy if exists "rst_stn_evals_all" on station_evaluations;
create policy "rst_stn_evals_all" on station_evaluations as restrictive for all to authenticated using (
  not is_restricted()
  or (title_cap('evaluation_stations_tab', true) and in_scope(station_id))
);

-- المبيعات
drop policy if exists "rst_sales_all" on sales_records;
create policy "rst_sales_all" on sales_records as restrictive for all to authenticated using (
  not is_restricted()
  or ((title_module('sales') or title_cap('reports_sales', true)) and in_scope(station_id))
);

-- تقييمات العملاء (الإدراج العام من الرابط بدون تسجيل دخول ما يتأثر — دور anon)
drop policy if exists "rst_cust_ratings_all" on customer_ratings;
create policy "rst_cust_ratings_all" on customer_ratings as restrictive for all to authenticated using (
  not is_restricted()
  or (title_module('customer_ratings') and title_cap('customer_ratings_view', true))
);
drop policy if exists "rst_rating_msgs_all" on station_rating_messages;
create policy "rst_rating_msgs_all" on station_rating_messages as restrictive for all to authenticated using (
  not is_restricted()
  or (title_module('customer_ratings') and title_cap('customer_ratings_view', true))
);

-- سجل النشاط (قراءة فقط — الإدراج التلقائي للتدقيق ما يتأثر)
drop policy if exists "rst_audit_select" on audit_log;
create policy "rst_audit_select" on audit_log as restrictive for select to authenticated using (
  not is_restricted() or (title_cap('reports_activity_log', true) and in_scope(station_id))
);

-- الموجودات
drop policy if exists "rst_lost_all" on lost_found_items;
create policy "rst_lost_all" on lost_found_items as restrictive for all to authenticated using (
  not is_restricted()
  or ((title_module('lost_found') or title_cap('reports_lost', true)) and in_scope(station_id))
);
drop policy if exists "rst_lost_delete" on lost_found_items;
create policy "rst_lost_delete" on lost_found_items as restrictive for delete to authenticated using (
  not is_restricted() or title_cap('lostfound_manage', false)
);

-- الترحيل
drop policy if exists "rst_trip_records_all" on trip_records;
create policy "rst_trip_records_all" on trip_records as restrictive for all to authenticated using (
  not is_restricted() or in_scope(station_id)
);
drop policy if exists "rst_transit_all" on trip_transit_records;
create policy "rst_transit_all" on trip_transit_records as restrictive for all to authenticated using (
  not is_restricted() or in_scope(station_id)
);
drop policy if exists "rst_station_trips_all" on station_trips;
create policy "rst_station_trips_all" on station_trips as restrictive for all to authenticated using (
  not is_restricted() or in_scope(station_id) or trip_is_rf(trip_schedule_id)
);

-- جدول الرحلات: رفع الجدول أو إدارة الرحلات (الإضافية RF فقط)
drop policy if exists "rst_trip_schedule_w" on trip_schedule;
create policy "rst_trip_schedule_w" on trip_schedule as restrictive for insert to authenticated with check (
  not is_restricted()
  or title_cap('transport_upload_schedule', true)
  or (title_cap('transport_manage_trips', true) and is_rf)
);
drop policy if exists "rst_trip_schedule_u" on trip_schedule;
create policy "rst_trip_schedule_u" on trip_schedule as restrictive for update to authenticated using (
  not is_restricted() or title_cap('transport_upload_schedule', true)
);
drop policy if exists "rst_trip_schedule_d" on trip_schedule;
create policy "rst_trip_schedule_d" on trip_schedule as restrictive for delete to authenticated using (
  not is_restricted()
  or title_cap('transport_upload_schedule', true)
  or (title_cap('transport_manage_trips', true) and is_rf)
);

drop policy if exists "rst_stops_w" on trip_schedule_stops;
create policy "rst_stops_w" on trip_schedule_stops as restrictive for insert to authenticated with check (
  not is_restricted() or title_cap('transport_upload_schedule', true)
  or (title_cap('transport_manage_trips', true) and trip_is_rf(trip_schedule_id))
);
drop policy if exists "rst_stops_u" on trip_schedule_stops;
create policy "rst_stops_u" on trip_schedule_stops as restrictive for update to authenticated using (
  not is_restricted() or title_cap('transport_upload_schedule', true)
);
drop policy if exists "rst_stops_d" on trip_schedule_stops;
create policy "rst_stops_d" on trip_schedule_stops as restrictive for delete to authenticated using (
  not is_restricted() or title_cap('transport_upload_schedule', true)
  or (title_cap('transport_manage_trips', true) and trip_is_rf(trip_schedule_id))
);

drop policy if exists "rst_uploads_all" on schedule_uploads;
create policy "rst_uploads_all" on schedule_uploads as restrictive for all to authenticated using (
  not is_restricted() or title_cap('transport_upload_schedule', true)
);

-- الجداول الإدارية: منع الكتابة على المقيّد (القراءة تبقى)
do $$
declare t text; c text;
begin
  foreach t in array array['stations','user_stations','shift_supervisor_assignments','custom_titles','app_settings','saved_station_groups']
  loop
    foreach c in array array['insert','update','delete'] loop
      execute format('drop policy if exists %I on %I', 'rst_'||t||'_'||c, t);
      if c = 'insert' then
        execute format('create policy %I on %I as restrictive for insert to authenticated with check (not is_restricted())', 'rst_'||t||'_'||c, t);
      else
        execute format('create policy %I on %I as restrictive for %s to authenticated using (not is_restricted())', 'rst_'||t||'_'||c, t, c);
      end if;
    end loop;
  end loop;
end $$;

-- المجلة: الكتابة لمن عنده القسم فقط
drop policy if exists "rst_magazine_w" on magazine_posts;
create policy "rst_magazine_w" on magazine_posts as restrictive for insert to authenticated with check (not is_restricted() or title_module('magazine'));
drop policy if exists "rst_magazine_u" on magazine_posts;
create policy "rst_magazine_u" on magazine_posts as restrictive for update to authenticated using (not is_restricted() or title_module('magazine'));
drop policy if exists "rst_magazine_d" on magazine_posts;
create policy "rst_magazine_d" on magazine_posts as restrictive for delete to authenticated using (not is_restricted() or title_module('magazine'));

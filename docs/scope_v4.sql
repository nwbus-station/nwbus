-- ============================================================
-- نطاق الموظفين v4: صلاحيات مستقلة (اطلاع / تقييم / موافقة إجازات) لكل مجموعة وظيفية
-- (مرحّلون، خدمة عملاء، مشرفون) + الموظفون المحددون بالاسم + تعديل المحطات المخصصة — كلها تنفرض من القاعدة
-- ============================================================

-- 1) ترحيل الصلاحيات القديمة: all_dispatchers → المرحّلون (اطلاع + تقييم + إجازات)، assigned_employees → تقييم + إجازات
update custom_titles set permissions = permissions || jsonb_build_object(
    'jg_dispatchers_view',     case when jsonb_typeof(permissions->'all_dispatchers') = 'boolean' then (permissions->>'all_dispatchers')::boolean else false end,
    'jg_dispatchers_evaluate', case when jsonb_typeof(permissions->'all_dispatchers') = 'boolean' then (permissions->>'all_dispatchers')::boolean else false end,
    'jg_dispatchers_leaves',   case when jsonb_typeof(permissions->'all_dispatchers') = 'boolean' then (permissions->>'all_dispatchers')::boolean else false end)
 where jsonb_exists(permissions, 'all_dispatchers') and not jsonb_exists(permissions, 'jg_dispatchers_view');

update custom_titles set permissions = permissions || jsonb_build_object(
    'assigned_evaluate', case when jsonb_typeof(permissions->'assigned_employees') = 'boolean' then (permissions->>'assigned_employees')::boolean else false end,
    'assigned_leaves',   case when jsonb_typeof(permissions->'assigned_employees') = 'boolean' then (permissions->>'assigned_employees')::boolean else false end)
 where jsonb_exists(permissions, 'assigned_employees') and not jsonb_exists(permissions, 'assigned_evaluate');

-- 2) دوال مساعدة (SECURITY DEFINER لتجنب التكرار اللانهائي)
create or replace function user_job(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select job_title from users where id = uid
$$;

-- هل لحساب المسمى الحالي هذا الإجراء (view / evaluate / leaves) على هذا المسمى الوظيفي؟
create or replace function job_cap(p_job text, p_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_job = 'dispatcher'       then title_cap('jg_dispatchers_'      || p_action, false)
    when p_job = 'customer_service' then title_cap('jg_customer_service_' || p_action, false)
    when p_job in ('station_supervisor', 'shift_supervisor', 'area_supervisor') then title_cap('jg_supervisors_' || p_action, false)
    else false
  end
$$;
grant execute on function user_job(uuid) to authenticated;
grant execute on function job_cap(text, text) to authenticated;

-- 3) سياسات الحساب المقيّد
drop policy if exists "rst_users_select" on users;
create policy "rst_users_select" on users as restrictive for select to authenticated using (
  not is_restricted()
  or id = current_user_id()
  or station_id = any(my_station_ids())
  or station_id = my_primary_station()
  or job_cap(job_title, 'view') or job_cap(job_title, 'evaluate') or job_cap(job_title, 'leaves')
  or ((title_cap('assigned_evaluate', false) or title_cap('assigned_leaves', false)) and id = any(my_assigned_ids()))
  or role::text in ('general_admin','stations_executive_director','assistant_stations_executive_director')
);

drop policy if exists "rst_leaves_all" on leaves;
create policy "rst_leaves_all" on leaves as restrictive for all to authenticated using (
  not is_restricted()
  or employee_id = current_user_id()
  or (title_cap('assigned_leaves', false) and employee_id = any(my_assigned_ids()))
  or job_cap(coalesce(job_title, user_job(employee_id)), 'leaves')
  or (title_cap('leaves_supervisor_stage', false) and (station_id = any(my_station_ids()) or station_id = my_primary_station()))
);

drop policy if exists "rst_emp_evals_all" on employee_evaluations;
create policy "rst_emp_evals_all" on employee_evaluations as restrictive for all to authenticated using (
  not is_restricted()
  or evaluator_id = current_user_id()
  or employee_id = current_user_id()
  or (title_cap('assigned_evaluate', false) and employee_id = any(my_assigned_ids()))
  or job_cap(user_job(employee_id), 'evaluate')
);

-- 4) جوال الموظف: لمن له صلاحية الاطلاع على مجموعته الوظيفية فقط
create or replace function get_staff_phone(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select u.phone from users u
  where u.id = p_id
    and ((is_admin() and not is_restricted()) or (is_restricted() and job_cap(u.job_title, 'view')))
$$;
revoke execute on function get_staff_phone(uuid) from public, anon;
grant execute on function get_staff_phone(uuid) to authenticated;
drop function if exists get_dispatcher_phone(uuid);

-- 5) المحطات: الحساب المقيّد يعدّل محطاته المخصصة فقط (بدون إضافة أو حذف أو دمج)
drop policy if exists "rst_stations_update" on stations;
create policy "rst_stations_update" on stations as restrictive for update to authenticated
  using (not is_restricted()
         or (title_cap('stations_manage_assigned', false) and (id = any(my_station_ids()) or id = my_primary_station())))
  with check (not is_restricted()
         or (title_cap('stations_manage_assigned', false) and (id = any(my_station_ids()) or id = my_primary_station())));

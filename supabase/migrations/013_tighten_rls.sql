-- ============================================================
-- 013: تشديد سياسات الأمان (RLS) حسب الأدوار
--   المبدأ: الحماية من قاعدة البيانات نفسها، لا من الواجهة.
--   موظف = محطاته فقط · مشرف = محطاته + موظفوها · محاسب = نطاقه · أدمن = الكل
--   ملاحظة: دوال الرفع/الدمج (012) تعمل بـ SECURITY DEFINER فلا تتأثر.
-- ============================================================

-- ─── دوال مساعدة ─────────────────────────────────────────────
-- محطات المستخدم الحالي: الأساسية + المعيّنة في user_stations
do $$
begin
  if to_regclass('public.user_stations') is not null then
    execute $f$
      create or replace function my_station_ids()
      returns uuid[] language sql security definer stable set search_path = public as $b$
        select coalesce(array_agg(distinct sid), '{}')::uuid[] from (
          select station_id as sid from users where auth_id = auth.uid() and station_id is not null
          union
          select us.station_id from user_stations us
          join users u on u.id = us.user_id
          where u.auth_id = auth.uid()
        ) t
      $b$;
    $f$;
  else
    execute $f$
      create or replace function my_station_ids()
      returns uuid[] language sql security definer stable set search_path = public as $b$
        select coalesce(array_agg(station_id), '{}')::uuid[]
        from users where auth_id = auth.uid() and station_id is not null
      $b$;
    $f$;
  end if;
end $$;

create or replace function is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from users where auth_id = auth.uid() and role = 'general_admin')
$$;

-- ─── تفعيل RLS على كل الجداول (بما فيها الجديدة) ─────────────
do $$
declare t text;
begin
  foreach t in array array[
    'users','stations','trip_schedule','trip_schedule_stops','trip_records',
    'trip_transit_records','trip_cancellations','lost_found_items','sales_records',
    'audit_log','station_trips','schedule_uploads','user_stations','leaves',
    'notifications','app_settings','shipments'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table %I enable row level security', t);
    end if;
  end loop;
end $$;

-- ─── حذف كل السياسات القديمة (بداية نظيفة) ───────────────────
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in (
      'users','stations','trip_schedule','trip_schedule_stops','trip_records',
      'trip_transit_records','trip_cancellations','lost_found_items','sales_records',
      'audit_log','station_trips','schedule_uploads','user_stations','leaves',
      'notifications','app_settings','shipments'
    )
  loop
    execute format('drop policy %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- ============================================================
-- USERS — الموظف يرى نفسه، المشرف يرى طاقم محطاته، الأدمن الكل
-- ============================================================
create policy "users_select" on users for select using (
  auth_id = auth.uid()
  or is_admin()
  or (current_user_role() = 'station_admin' and station_id = any(my_station_ids()))
);
create policy "users_insert" on users for insert with check (
  is_admin()
  or (current_user_role() = 'station_admin'
      and station_id = any(my_station_ids())
      and role not in ('general_admin', 'station_admin'))
);
create policy "users_update" on users for update using (
  is_admin()
  or auth_id = auth.uid()
  or (current_user_role() = 'station_admin'
      and station_id = any(my_station_ids())
      and role not in ('general_admin', 'station_admin'))
);
create policy "users_delete" on users for delete using (is_admin());

-- ============================================================
-- STATIONS — قراءة للجميع، إدارة للأدمن فقط
-- ============================================================
create policy "stations_select" on stations for select using (auth.uid() is not null);
create policy "stations_write"  on stations for all
  using (is_admin()) with check (is_admin());

-- ============================================================
-- TRIP SCHEDULE — قراءة للجميع، الكتابة للأدمن (والمشرف لرحلات RF فقط)
-- ============================================================
create policy "trip_schedule_select" on trip_schedule for select using (auth.uid() is not null);
create policy "trip_schedule_insert" on trip_schedule for insert with check (
  is_admin() or (current_user_role() = 'station_admin' and is_rf = true)
);
create policy "trip_schedule_update" on trip_schedule for update using (is_admin());
create policy "trip_schedule_delete" on trip_schedule for delete using (
  is_admin() or (current_user_role() = 'station_admin' and is_rf = true)
);

create policy "trip_stops_select" on trip_schedule_stops for select using (auth.uid() is not null);
create policy "trip_stops_write" on trip_schedule_stops for all using (
  is_admin() or (current_user_role() = 'station_admin' and exists (
    select 1 from trip_schedule t where t.id = trip_schedule_id and t.is_rf
  ))
) with check (
  is_admin() or (current_user_role() = 'station_admin' and exists (
    select 1 from trip_schedule t where t.id = trip_schedule_id and t.is_rf
  ))
);

-- ============================================================
-- TRIP RECORDS — كل مستخدم داخل محطاته فقط
-- ============================================================
create policy "trip_records_select" on trip_records for select using (
  is_admin() or station_id = any(my_station_ids())
);
create policy "trip_records_insert" on trip_records for insert with check (
  is_admin() or station_id = any(my_station_ids())
);
create policy "trip_records_update" on trip_records for update using (
  is_admin() or station_id = any(my_station_ids())
);
create policy "trip_records_delete" on trip_records for delete using (
  is_admin() or (current_user_role() = 'station_admin' and exists (
    select 1 from trip_schedule t where t.id = trip_schedule_id and t.is_rf
  ))
);

-- ============================================================
-- TRANSIT RECORDS (قديم) — نفس منطق سجلات الرحلات
-- ============================================================
create policy "transit_select" on trip_transit_records for select using (
  is_admin() or station_id = any(my_station_ids())
);
create policy "transit_write" on trip_transit_records for all using (
  is_admin() or station_id = any(my_station_ids())
) with check (
  is_admin() or station_id = any(my_station_ids())
);

-- ============================================================
-- TRIP CANCELLATIONS — قراءة للجميع، كتابة للمشرف والأدمن
-- ============================================================
create policy "cancellations_select" on trip_cancellations for select using (auth.uid() is not null);
create policy "cancellations_write" on trip_cancellations for all using (
  is_admin() or current_user_role() = 'station_admin'
) with check (
  is_admin() or current_user_role() = 'station_admin'
);

-- ============================================================
-- LOST & FOUND — البحث متاح للجميع (غرض ضائع يُسأل عنه في أي محطة)
--                والتسجيل/التعديل داخل محطات المستخدم
-- ============================================================
create policy "lost_select" on lost_found_items for select using (auth.uid() is not null);
create policy "lost_insert" on lost_found_items for insert with check (
  is_admin() or station_id = any(my_station_ids())
);
create policy "lost_update" on lost_found_items for update using (
  is_admin() or station_id = any(my_station_ids())
);
create policy "lost_delete" on lost_found_items for delete using (is_admin());

-- ============================================================
-- SALES — الموظف يرى مبيعاته، المحاسب/المشرف نطاق محطاتهم، الأدمن الكل
-- ============================================================
create policy "sales_select" on sales_records for select using (
  is_admin()
  or (current_user_role() in ('accountant', 'station_admin') and station_id = any(my_station_ids()))
  or created_by = current_user_id()
);
create policy "sales_insert" on sales_records for insert with check (
  is_admin() or station_id = any(my_station_ids())
);
create policy "sales_update" on sales_records for update using (
  is_admin()
  or (current_user_role() = 'accountant' and station_id = any(my_station_ids()))
  or (created_by = current_user_id() and sale_date = current_date)
);
create policy "sales_delete" on sales_records for delete using (is_admin());

-- ============================================================
-- AUDIT LOG — قراءة: الأدمن الكل والمشرف محطاته · لا تعديل ولا حذف لأحد
-- ============================================================
create policy "audit_select" on audit_log for select using (
  is_admin()
  or (current_user_role() = 'station_admin' and station_id = any(my_station_ids()))
);
create policy "audit_insert" on audit_log for insert with check (auth.uid() is not null);

-- ============================================================
-- الجداول الأحدث (تُنشأ سياساتها فقط إن كان الجدول موجوداً)
-- ============================================================
do $$
begin
  /* station_trips — قراءة للجميع؛ الأدمن الكل؛ المشرف محطاته أو رحلات RF */
  if to_regclass('public.station_trips') is not null then
    execute $p$create policy "sttrips_select" on station_trips for select using (auth.uid() is not null)$p$;
    execute $p$create policy "sttrips_write" on station_trips for all using (
      is_admin() or (current_user_role() = 'station_admin' and (
        station_id = any(my_station_ids())
        or exists (select 1 from trip_schedule t where t.id = trip_schedule_id and t.is_rf)
      ))
    ) with check (
      is_admin() or (current_user_role() = 'station_admin' and (
        station_id = any(my_station_ids())
        or exists (select 1 from trip_schedule t where t.id = trip_schedule_id and t.is_rf)
      ))
    )$p$;
  end if;

  /* schedule_uploads — أدمن فقط */
  if to_regclass('public.schedule_uploads') is not null then
    execute $p$create policy "uploads_all" on schedule_uploads for all
      using (is_admin()) with check (is_admin())$p$;
  end if;

  /* user_stations — قراءة للجميع، إدارة للأدمن */
  if to_regclass('public.user_stations') is not null then
    execute $p$create policy "ustations_select" on user_stations for select using (auth.uid() is not null)$p$;
    execute $p$create policy "ustations_write" on user_stations for all
      using (is_admin()) with check (is_admin())$p$;
  end if;

  /* leaves — الموظف طلباته، المشرف محطاته، الأدمن الكل */
  if to_regclass('public.leaves') is not null then
    execute $p$create policy "leaves_select" on leaves for select using (
      is_admin()
      or employee_id = current_user_id()
      or (current_user_role() = 'station_admin' and station_id = any(my_station_ids()))
    )$p$;
    execute $p$create policy "leaves_insert" on leaves for insert with check (
      is_admin() or employee_id = current_user_id()
    )$p$;
    execute $p$create policy "leaves_update" on leaves for update using (
      is_admin()
      or (current_user_role() = 'station_admin' and station_id = any(my_station_ids()))
    )$p$;
    execute $p$create policy "leaves_delete" on leaves for delete using (
      is_admin()
      or (employee_id = current_user_id() and status = 'pending')
    )$p$;
  end if;

  /* notifications — كل مستخدم إشعاراته فقط (الإنشاء متاح: النظام يُشعر الآخرين) */
  if to_regclass('public.notifications') is not null then
    execute $p$create policy "notif_select" on notifications for select using (user_id = current_user_id())$p$;
    execute $p$create policy "notif_update" on notifications for update using (user_id = current_user_id())$p$;
    execute $p$create policy "notif_insert" on notifications for insert with check (auth.uid() is not null)$p$;
    execute $p$create policy "notif_delete" on notifications for delete using (user_id = current_user_id())$p$;
  end if;

  /* app_settings — قراءة للجميع، تعديل للأدمن */
  if to_regclass('public.app_settings') is not null then
    execute $p$create policy "settings_select" on app_settings for select using (auth.uid() is not null)$p$;
    execute $p$create policy "settings_write" on app_settings for all
      using (is_admin()) with check (is_admin())$p$;
  end if;

  /* shipments — قراءة للجميع، كتابة للمشرف والأدمن */
  if to_regclass('public.shipments') is not null then
    execute $p$create policy "shipments_select" on shipments for select using (auth.uid() is not null)$p$;
    execute $p$create policy "shipments_write" on shipments for all using (
      is_admin() or current_user_role() = 'station_admin'
    ) with check (
      is_admin() or current_user_role() = 'station_admin'
    )$p$;
  end if;
end $$;

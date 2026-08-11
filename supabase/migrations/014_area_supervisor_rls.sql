-- ============================================================
-- 014: إضافة دور مشرف المنطقة (area_supervisor) لسياسات RLS
--   my_station_ids() تعمل بالفعل — تجلب محطاته من user_stations
--   المطلوب فقط: إضافة 'area_supervisor' لكل سياسة تتحقق من 'station_admin'
-- ============================================================

-- دالة مساعدة: هل المستخدم مشرف محطة أو مشرف منطقة؟
create or replace function is_supervisor()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from users
    where auth_id = auth.uid()
      and role in ('station_admin', 'area_supervisor', 'shift_supervisor')
  )
$$;

-- ─── حذف السياسات المتأثرة وإعادة إنشائها ───────────────────

-- USERS
drop policy if exists "users_select" on users;
drop policy if exists "users_insert" on users;
drop policy if exists "users_update" on users;

create policy "users_select" on users for select using (
  auth_id = auth.uid()
  or is_admin()
  or (current_user_role() in ('station_admin','area_supervisor') and station_id = any(my_station_ids()))
);
create policy "users_insert" on users for insert with check (
  is_admin()
  or (current_user_role() in ('station_admin','area_supervisor')
      and station_id = any(my_station_ids())
      and role not in ('general_admin','station_admin','area_supervisor'))
);
create policy "users_update" on users for update using (
  is_admin()
  or auth_id = auth.uid()
  or (current_user_role() in ('station_admin','area_supervisor')
      and station_id = any(my_station_ids())
      and role not in ('general_admin','station_admin','area_supervisor'))
);

-- TRIP RECORDS — الحذف
drop policy if exists "trip_records_delete" on trip_records;
create policy "trip_records_delete" on trip_records for delete using (
  is_admin()
  or (current_user_role() in ('station_admin','area_supervisor') and exists (
    select 1 from trip_schedule t where t.id = trip_schedule_id and t.is_rf
  ))
);

-- SALES
drop policy if exists "sales_select" on sales_records;
drop policy if exists "sales_update" on sales_records;

create policy "sales_select" on sales_records for select using (
  is_admin()
  or (current_user_role() in ('accountant','station_admin','area_supervisor') and station_id = any(my_station_ids()))
  or created_by = current_user_id()
);
create policy "sales_update" on sales_records for update using (
  is_admin()
  or (current_user_role() in ('accountant','area_supervisor') and station_id = any(my_station_ids()))
  or (created_by = current_user_id() and sale_date = current_date)
);

-- AUDIT LOG
drop policy if exists "audit_select" on audit_log;
create policy "audit_select" on audit_log for select using (
  is_admin()
  or (current_user_role() in ('station_admin','area_supervisor') and station_id = any(my_station_ids()))
);

-- LEAVES
do $$
begin
  if to_regclass('public.leaves') is not null then
    drop policy if exists "leaves_select" on leaves;
    drop policy if exists "leaves_update" on leaves;

    execute $p$create policy "leaves_select" on leaves for select using (
      is_admin()
      or employee_id = current_user_id()
      or (current_user_role() in ('station_admin','area_supervisor') and station_id = any(my_station_ids()))
    )$p$;
    execute $p$create policy "leaves_update" on leaves for update using (
      is_admin()
      or (current_user_role() in ('station_admin','area_supervisor') and station_id = any(my_station_ids()))
    )$p$;
  end if;
end $$;

-- STATION TRIPS
do $$
begin
  if to_regclass('public.station_trips') is not null then
    drop policy if exists "sttrips_write" on station_trips;
    execute $p$create policy "sttrips_write" on station_trips for all using (
      is_admin() or (current_user_role() in ('station_admin','area_supervisor') and (
        station_id = any(my_station_ids())
        or exists (select 1 from trip_schedule t where t.id = trip_schedule_id and t.is_rf)
      ))
    ) with check (
      is_admin() or (current_user_role() in ('station_admin','area_supervisor') and (
        station_id = any(my_station_ids())
        or exists (select 1 from trip_schedule t where t.id = trip_schedule_id and t.is_rf)
      ))
    )$p$;
  end if;
end $$;

-- TRIP CANCELLATIONS
drop policy if exists "cancellations_write" on trip_cancellations;
create policy "cancellations_write" on trip_cancellations for all using (
  is_admin() or current_user_role() in ('station_admin','area_supervisor')
) with check (
  is_admin() or current_user_role() in ('station_admin','area_supervisor')
);

-- SHIPMENTS
do $$
begin
  if to_regclass('public.shipments') is not null then
    drop policy if exists "shipments_write" on shipments;
    execute $p$create policy "shipments_write" on shipments for all using (
      is_admin() or current_user_role() in ('station_admin','area_supervisor')
    ) with check (
      is_admin() or current_user_role() in ('station_admin','area_supervisor')
    )$p$;
  end if;
end $$;

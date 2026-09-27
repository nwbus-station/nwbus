-- ============================================================
-- إدارة الخريطة: تعديل مواقع المحطات وإضافة محطات/نقاط توقف — كلها من القاعدة
-- الأدمن العام دائماً مسموح له. لأي دور أو مسمى آخر: بمفتاح "إدارة الخريطة" من إدارة الصلاحيات.
-- ============================================================

-- 1) سياسات إضافية: من عنده مفتاح إدارة الخريطة يضيف ويعدّل المحطات (بدون حذف)
drop policy if exists "stations_map_insert" on stations;
create policy "stations_map_insert" on stations for insert to authenticated
  with check (title_cap('map_manage', false));
drop policy if exists "stations_map_update" on stations;
create policy "stations_map_update" on stations for update to authenticated
  using (title_cap('map_manage', false)) with check (title_cap('map_manage', false));

-- 2) الحساب المقيّد: يسمح له إذا عنده مفتاح إدارة الخريطة (أو تعديل محطاته المخصصة كما قبل)
drop policy if exists "rst_stations_insert" on stations;
create policy "rst_stations_insert" on stations as restrictive for insert to authenticated
  with check (not is_restricted() or title_cap('map_manage', false));

drop policy if exists "rst_stations_update" on stations;
create policy "rst_stations_update" on stations as restrictive for update to authenticated
  using (not is_restricted()
         or title_cap('map_manage', false)
         or (title_cap('stations_manage_assigned', false) and (id = any(my_station_ids()) or id = my_primary_station())))
  with check (not is_restricted()
         or title_cap('map_manage', false)
         or (title_cap('stations_manage_assigned', false) and (id = any(my_station_ids()) or id = my_primary_station())));

-- 3) مدير الخريطة يغيّر الموقع والاسم والنوع والمنطقة والحالة فقط — مو أرقام الرحلات أو دمج الوصول/المغادرة
create or replace function guard_stations_map()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth.role() = 'service_role' then return new; end if;
  if is_admin() and not is_restricted() then return new; end if;
  if title_cap('stations_manage_assigned', false) then return new; end if;
  if tg_op = 'UPDATE' and (
        new.trip_numbers     is distinct from old.trip_numbers
     or new.city_group       is distinct from old.city_group
     or new.combined_arr_dep is distinct from old.combined_arr_dep) then
    raise exception 'ما عندك صلاحية تعديل هذه الحقول' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_stations_map on stations;
create trigger trg_guard_stations_map before update on stations
  for each row execute function guard_stations_map();

-- 4) تحقق من الإحداثيات لكل من يكتبها
create or replace function check_station_coords()
returns trigger language plpgsql as $$
begin
  if new.lat is not null and new.lng is not null then
    if new.lat < -90 or new.lat > 90 or new.lng < -180 or new.lng > 180 or (new.lat = 0 and new.lng = 0) then
      raise exception 'إحداثيات غير صحيحة' using errcode = '22003';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_check_station_coords on stations;
create trigger trg_check_station_coords before insert or update of lat, lng on stations
  for each row execute function check_station_coords();

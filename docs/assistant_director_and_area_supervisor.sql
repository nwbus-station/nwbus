-- ============================================================
-- الخطوة 1 — شغّلها لوحدها أولاً (ALTER TYPE لازم يكتمل قبل استخدام القيمة)
-- تضيف دور "مساعد المدير التنفيذي للمحطات" لقائمة الأدوار في قاعدة البيانات
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'assistant_stations_executive_director';
  END IF;
END $$;


-- ============================================================
-- الخطوة 2 — شغّلها بعد نجاح الخطوة 1
-- أ) الأدمن على مستوى RLS: يشمل مساعد المدير (وأدوار الأدمن الأخرى)
-- ب) مشرف المنطقة = مشرف المحطة بالضبط في كل سياسات RLS
-- (قبل التشغيل تأكد من تعريف is_admin() الحالي: select pg_get_functiondef('is_admin'::regproc);)
-- ============================================================
create or replace function is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from users
    where auth_id = auth.uid()
      and role::text in ('general_admin', 'stations_executive_director', 'assistant_stations_executive_director')
  )
$$;

create or replace function current_user_role()
returns user_role as $$
  select case when role::text = 'area_supervisor' then 'station_admin'::user_role else role end
  from users where auth_id = auth.uid()
$$ language sql security definer stable;

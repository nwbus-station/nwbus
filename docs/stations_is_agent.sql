-- ============================================================
--  تصنيف "محطة وكيل" — تظهر بعلامة وكيل وتُحسب منفصلة في التقارير (تقرير Excel التشغيلي والنسخة الاحتياطية)
--  شغّله مرة واحدة بـ SQL Editor ثم علّم محطات الوكلاء من صفحة المحطات (تعديل ← محطة وكيل)
-- ============================================================
alter table public.stations add column if not exists is_agent boolean not null default false;

-- فحص
select count(*) filter (where is_agent) as agent_stations, count(*) as total from public.stations;

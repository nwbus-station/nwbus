-- أسماء المحطات العربية لاستبيان العملاء: العمود الحالي name_ar فيه أسماء إنجليزية، فنضيف عمود عرض عربي
-- العربية: survey_name_ar — الإنجليزية والأردو: name_en (أو name_ar الإنجليزي لو فاضي)
-- الأسماء المعلّمة بـ (?) ترجمتها تقديرية وتحتاج مراجعتك

alter table public.stations add column if not exists survey_name_ar text;

update public.stations s set survey_name_ar = v.ar
from (values
  ('Abu Arish', 'أبو عريش'),
  ('Ad Darb', 'الدرب'),
  ('Afif', 'عفيف'),
  ('Al Atawilah', 'العطاولة'),
  ('Al Badayea', 'البدائع'),
  ('Al Bahah', 'الباحة'),
  ('Al Bashayer', 'البشائر'),                       -- (?)
  ('Al Bijadyah', 'البجادية'),
  ('Al Dawadmi', 'الدوادمي'),
  ('Al Ghat', 'الغاط'),
  ('Al Ghazalah', 'الغزالة'),
  ('Al Hawiyah (Taif)', 'الحوية (الطائف)'),
  ('Al Henakiah', 'الحناكية'),
  ('Al Hulayfah As Sufla', 'الحليفة السفلى'),
  ('Al Humiyat', 'الحميات'),                        -- (?)
  ('Al Jumum', 'الجموم'),
  ('Al Khasrah', 'الخصرة'),                         -- (?)
  ('Al Khurma', 'الخرمة'),
  ('Al Madinah Bus Station', 'محطة حافلات المدينة المنورة'),
  ('Al Madinah Train Station', 'محطة قطار المدينة المنورة'),
  ('Al Majmaah', 'المجمعة'),
  ('Al Muazam', 'المعظم'),                          -- (?)
  ('Al Muthallth', 'المثلث'),
  ('Al Muzahmiyya', 'المزاحمية'),
  ('Al Petra - An Nabhaniyah', 'البترا - النبهانية'),
  ('Al Qunfudah', 'القنفذة'),
  ('Al Quwaiiyah', 'القويعية'),
  ('Al Selselah', 'السلسلة'),                       -- (?)
  ('Al Shegrah', 'الشقرة'),                         -- (?)
  ('Al Shuqaiq', 'الشقيق'),
  ('Al Sir', 'السر'),
  ('Al Ula', 'العلا'),
  ('Al Ula Airport', 'مطار العلا'),
  ('Al Ula Winter Park', 'ونتر بارك العلا'),
  ('Al Wajh', 'الوجه'),
  ('Amaala', 'أمالا'),
  ('Ar Rass', 'الرس'),
  ('Ar Ruwaidhah', 'الرويضة'),
  ('Asbtar', 'أسبطر'),                              -- (?)
  ('Badr', 'بدر'),
  ('Baish', 'بيش'),
  ('Baljurashi', 'بلجرشي'),
  ('Baqaa', 'بقعاء'),
  ('Bir Ibn Hirmas', 'بئر ابن هرماس'),
  ('Bisha', 'بيشة'),
  ('Buraydah Bus Station', 'محطة حافلات بريدة'),
  ('Dhalm', 'ضلم'),                                 -- (?)
  ('Dhurma', 'ضرما'),
  ('Duba', 'ضباء'),
  ('Ghazaial', 'غزايل'),                            -- (?)
  ('Hail Airport', 'مطار حائل'),
  ('Hail Bus Station', 'محطة حافلات حائل'),
  ('Hail Qaffar Square', 'ميدان قفار حائل'),
  ('Hail Train Station', 'محطة قطار حائل'),
  ('Halaban', 'حلبان'),
  ('Halat Ammar', 'حالة عمار'),
  ('Haql', 'حقل'),
  ('Jazan Bus Station', 'محطة حافلات جازان'),
  ('Jeddah Airport - North Terminal', 'مطار جدة - الصالة الشمالية'),
  ('Jeddah Airport - Terminal 1', 'مطار جدة - صالة 1'),
  ('Jeddah Airport - Terminal 4', 'مطار جدة - صالة 4'),
  ('Jeddah Al Balad', 'جدة البلد'),
  ('Jeddah Al Khomrah', 'جدة الخمرة'),
  ('Jeddah Kilo 10', 'جدة كيلو 10'),
  ('Jeddah Train Station', 'محطة قطار جدة'),
  ('Jilah', 'جلاه'),                                -- (?)
  ('Khamis Mushait Bus Station', 'محطة حافلات خميس مشيط'),
  ('Khaybar', 'خيبر'),
  ('Khulais', 'خليص'),
  ('Linah', 'لينة'),
  ('Mahd Al Thahab', 'مهد الذهب'),
  ('Makkah Almaasam', 'مكة المعاصم'),
  ('Makkah Bus Station (Jarwal)', 'محطة حافلات مكة المكرمة (جرول)'),
  ('Marat', 'مرات'),
  ('Mastorah', 'مستورة'),
  ('New Muwayh', 'المويه الجديد'),
  ('Qia', 'قيا'),                                   -- (?)
  ('Rabigh', 'رابغ'),
  ('Radwan', 'رضوان'),
  ('Rafha', 'رفحاء'),
  ('Red Sea Welcome Center', 'مركز استقبال البحر الأحمر'),
  ('Riyadh Bus Station', 'محطة حافلات الرياض'),
  ('Riyadh Dar Al Shifa Hospital', 'الرياض مستشفى دار الشفاء'),
  ('Riyadh Tuwaiq Metro', 'الرياض مترو طويق'),
  ('Sabya', 'صبيا'),
  ('Shaqra', 'شقراء'),
  ('Shihiya', 'الشيحية'),                           -- (?)
  ('Tabuk Bus Station', 'محطة حافلات تبوك'),
  ('Turbah (Taif)', 'تربة (الطائف)'),
  ('Umluj', 'أملج'),
  ('Unayzah', 'عنيزة'),
  ('Yanbu Bus Station', 'محطة حافلات ينبع'),
  ('Yanbu Royal Commission Station', 'محطة الهيئة الملكية بينبع')
) as v(en, ar)
where s.name_ar = v.en and s.survey_name_ar is null;

-- الدالة العامة تُرجع الاسم العربي أيضاً (تغيّر شكل المخرجات فنحذفها ونعيد إنشاءها)
drop function if exists public.survey_stations();
create or replace function public.survey_stations()
returns table (id uuid, name_ar text, name_en text, survey_name_ar text, city_group text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name_ar, s.name_en, s.survey_name_ar, s.city_group
  from stations s
  where s.merged_into is null
    and coalesce(s.is_active, true)
    and coalesce(s.name_ar, '') not ilike '%only rest%'
    and coalesce(s.name_en, '') not ilike '%only rest%'
  order by coalesce(s.survey_name_ar, s.name_ar)
$$;

revoke all on function public.survey_stations() from public;
grant execute on function public.survey_stations() to anon, authenticated;

-- بعد التشغيل: المحطات اللي لسا بدون اسم عربي (أرسلها لي أترجمها)
select name_ar from public.stations
where survey_name_ar is null and merged_into is null and coalesce(is_active, true)
  and name_ar not ilike '%only rest%'
order by name_ar;

-- ============================================================
-- مدن استبيان تقييم الركاب: تُدار الآن من القاعدة بدل ما تكون ثابتة بالكود
-- القراءة عامة (صفحة الاستبيان بدون تسجيل دخول)، والكتابة للأدمن العام فقط
-- ============================================================

create table if not exists public.survey_cities (
  city_key    text primary key,
  name_ar     text not null,
  name_en     text not null,
  color       text not null default '#5B5BD6',
  url         text,              -- فارغ = الرابط الافتراضي (BASE + city_key)
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.survey_cities enable row level security;

drop policy if exists "survey_cities_select" on public.survey_cities;
create policy "survey_cities_select" on public.survey_cities for select using (true);

drop policy if exists "survey_cities_write" on public.survey_cities;
create policy "survey_cities_write" on public.survey_cities for all
  using (is_admin() and not is_restricted())
  with check (is_admin() and not is_restricted());

grant select on public.survey_cities to anon;
grant select, insert, update, delete on public.survey_cities to authenticated;
grant all on public.survey_cities to service_role;

-- تعبئة المدن الحالية (لا يكرر لو شغّلته أكثر من مرة)
insert into public.survey_cities (city_key, name_ar, name_en, color, sort_order) values
  ('Jeddah',  'جدة',              'Jeddah',      '#2563EB', 1),
  ('Makkah',  'مكة المكرمة',       'Makkah',      '#7C3AED', 2),
  ('Madinah', 'المدينة المنورة',    'Al Madinah',  '#059669', 3),
  ('Riyadh',  'الرياض',            'Riyadh',      '#DC2626', 4),
  ('Tabuk',   'تبوك',              'Tabuk',       '#D97706', 5),
  ('Hail',    'حائل',              'Hail',        '#0891B2', 6),
  ('Taif',    'الطائف',            'Taif',        '#BE185D', 7),
  ('jazan',   'جازان',             'Jazan',       '#16A34A', 8),
  ('Yanbu',   'ينبع',              'Yanbu',       '#9333EA', 9),
  ('T1',      'مطار جدة — صالة 1', 'Jeddah T1',   '#475569', 10)
on conflict (city_key) do nothing;

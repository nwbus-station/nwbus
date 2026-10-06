-- ربط الصلاحية المخصصة بمسمى وظيفي وبتقييم العميل: الموظف اللي تعطيه هذي الصلاحية ياخذها تلقائياً
alter table public.custom_titles add column if not exists job_title text;
alter table public.custom_titles add column if not exists can_rate_customers boolean not null default false;

-- صفة التقييم ونسبته للصلاحية المخصصة: مشرف وردية 25% / مشرف محطة 35% / المدير التنفيذي 40% (فارغ = مشرف المحطة)
alter table public.custom_titles add column if not exists eval_source text
  check (eval_source is null or eval_source in ('shift_supervisor', 'station_admin', 'stations_executive_director'));

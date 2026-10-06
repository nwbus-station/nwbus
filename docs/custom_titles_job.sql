-- ربط الصلاحية المخصصة بمسمى وظيفي وبتقييم العميل: الموظف اللي تعطيه هذي الصلاحية ياخذها تلقائياً
alter table public.custom_titles add column if not exists job_title text;
alter table public.custom_titles add column if not exists can_rate_customers boolean not null default false;

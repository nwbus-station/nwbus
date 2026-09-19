-- ============================================================
-- المسميات الوظيفية المخصصة + مصفوفة الصلاحيات
-- الدور الأساسي (base_role) هو سقف الصلاحيات على مستوى قاعدة البيانات،
-- والمصفوفة (permissions) + الأقسام تحدد ما يظهر ويُسمح به داخل التطبيق.
-- إضافة فقط — ما يتغير شي على الموظفين الحاليين.
-- ============================================================
create table if not exists custom_titles (
  id              uuid primary key default gen_random_uuid(),
  name_ar         text not null,
  name_en         text,
  base_role       user_role not null,
  permissions     jsonb not null default '{}'::jsonb,
  allowed_modules text[],
  created_by      uuid,
  created_at      timestamptz not null default now()
);

alter table users add column if not exists custom_title_id uuid references custom_titles(id) on delete set null;

alter table custom_titles enable row level security;
drop policy if exists "titles_select" on custom_titles;
drop policy if exists "titles_write"  on custom_titles;
create policy "titles_select" on custom_titles for select using (auth.uid() is not null);
create policy "titles_write"  on custom_titles for all using (is_admin()) with check (is_admin());

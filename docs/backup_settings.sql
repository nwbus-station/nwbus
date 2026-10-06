-- ============================================================
--  إعدادات النسخة الاحتياطية والتقرير اليومي (من صفحة الإعدادات بالتطبيق)
--  السكربت على Google يقرأ هذا الجدول: الإيميلات، التفعيل، ساعة الإرسال، وطلب "أرسل الآن"
--  ويكتب فيه نتيجة آخر تشغيل. شغّله كاملاً بـ SQL Editor.
-- ============================================================
create table if not exists public.backup_settings (
  id              int primary key default 1 check (id = 1),
  enabled         boolean     not null default true,
  emails          text[]      not null default '{}',
  send_hour       int         not null default 5 check (send_hour between 0 and 23),
  send_now_at     timestamptz,              -- طلب إرسال فوري من التطبيق
  last_run_at     timestamptz,
  last_ok         boolean,
  last_message    text,
  last_recipients text[],
  last_rows       int,
  last_seconds    int,
  last_scheduled_on date,                   -- آخر يوم تم فيه الإرسال المجدول (حتى لا يتكرر)
  updated_at      timestamptz not null default now()
);

alter table public.backup_settings add column if not exists last_scheduled_on date;

insert into public.backup_settings (id) values (1) on conflict (id) do nothing;

alter table public.backup_settings enable row level security;

-- الأدمن فقط (ومن عنده صفحة الإعدادات من الصلاحيات المخصصة). السكربت يستخدم service_role فيتجاوز RLS.
drop policy if exists "backup_settings_admin_select" on public.backup_settings;
create policy "backup_settings_admin_select" on public.backup_settings for select to authenticated
  using (is_admin() and (not is_restricted() or title_cap('settings_access', true)));

drop policy if exists "backup_settings_admin_update" on public.backup_settings;
create policy "backup_settings_admin_update" on public.backup_settings for update to authenticated
  using (is_admin() and (not is_restricted() or title_cap('settings_access', true)))
  with check (is_admin() and (not is_restricted() or title_cap('settings_access', true)));

-- فحص: لازم يرجع صف واحد
select id, enabled, emails, send_hour from public.backup_settings;

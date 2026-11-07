-- ملاحظات المتابعة على حركات الجدول الشامل (طبقة منفصلة عن سجلات المرحّل، فلا تؤثر على تقارير الترحيل).
-- شغّل كل جزء بشكل منفصل في Supabase SQL Editor.

create table if not exists public.transport_notes (
  id               uuid primary key default gen_random_uuid(),
  note_date        date not null,
  trip_schedule_id uuid not null references public.trip_schedule(id) on delete cascade,
  station_id       uuid not null references public.stations(id) on delete cascade,
  role             text not null check (role in ('arrival', 'departure')),
  text             text not null check (length(btrim(text)) > 0 and length(text) <= 1000),
  created_by       uuid not null references public.users(id),
  created_by_name  text not null,
  created_at       timestamptz not null default now()
);

create index if not exists transport_notes_date_idx on public.transport_notes (note_date);

alter table public.transport_notes enable row level security;

-- القراءة لكل المسجَّلين (الصفحة نفسها تُظهرها فقط لمن يرى الجدول الشامل)
create policy transport_notes_select on public.transport_notes
  for select to authenticated using (true);

-- الإضافة: باسم صاحب الحساب فقط
create policy transport_notes_insert on public.transport_notes
  for insert to authenticated with check (created_by = current_user_id());

-- الحذف: صاحب الملاحظة أو الأدمن العام
create policy transport_notes_delete on public.transport_notes
  for delete to authenticated using (created_by = current_user_id() or current_user_role() = 'general_admin');

grant select, insert, delete on public.transport_notes to authenticated;
grant all on public.transport_notes to service_role;

-- تحديث فوري للملاحظات بين الأجهزة
alter publication supabase_realtime add table public.transport_notes;

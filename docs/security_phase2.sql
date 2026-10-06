-- المرحلة 2: حراس الحسابات المقيّدة (مشرف المرحلين وأمثاله) على الجداول اللي طلعت بالفحص الدقيق بدون حارس

-- 1) جداول قديمة غير مستخدمة بالتطبيق وكانت مفتوحة بالكامل للمقيّد: نمنعه عنها نهائياً (القراءة والكتابة)
drop policy if exists "rst_shipments_all" on public.shipments;
create policy "rst_shipments_all" on public.shipments as restrictive for all to authenticated
  using (not is_restricted()) with check (not is_restricted());

drop policy if exists "rst_trip_cancellations_all" on public.trip_cancellations;
create policy "rst_trip_cancellations_all" on public.trip_cancellations as restrictive for all to authenticated
  using (not is_restricted()) with check (not is_restricted());

-- 2) رفع ملفات المجلة (Storage): للمقيّد فقط لو معه قسم Event (نشر وإدارة) — باقي المخازن ما تتأثر
drop policy if exists "rst_magazine_files_insert" on storage.objects;
create policy "rst_magazine_files_insert" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id not in ('magazine-images', 'magazine-files') or not is_restricted() or title_module('magazine'));

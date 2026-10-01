-- نداء الركاب: تخزين مقاطع صوتية جاهزة (مُسجّلة/مولّدة مرة واحدة) بدل توليد الصوت حياً
-- كل اسم محطة + عبارتين ثابتتين (المقدمة، "مروراً بـ") تُرفع مرة وحدة وتُستخدم دايماً بنفس الجودة
-- المسارات ثابتة (stations/{station_id}.mp3 و phrases/intro.mp3 و phrases/via.mp3) فما نحتاج عمود جديد بالجدول

-- Bucket تخزين عام للقراءة، الرفع للأدمن غير المقيّد فقط
insert into storage.buckets (id, name, public)
values ('audio-clips', 'audio-clips', true)
on conflict (id) do nothing;

drop policy if exists "audio_clips_public_read" on storage.objects;
create policy "audio_clips_public_read" on storage.objects
  for select using (bucket_id = 'audio-clips');

drop policy if exists "audio_clips_admin_write" on storage.objects;
create policy "audio_clips_admin_write" on storage.objects
  for insert with check (bucket_id = 'audio-clips' and is_admin() and not is_restricted());

drop policy if exists "audio_clips_admin_update" on storage.objects;
create policy "audio_clips_admin_update" on storage.objects
  for update using (bucket_id = 'audio-clips' and is_admin() and not is_restricted());

drop policy if exists "audio_clips_admin_delete" on storage.objects;
create policy "audio_clips_admin_delete" on storage.objects
  for delete using (bucket_id = 'audio-clips' and is_admin() and not is_restricted());

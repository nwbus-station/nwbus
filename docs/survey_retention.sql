-- بعد 24 شهراً: نُخفي هوية الاستبيان بدل حذفه — نشيل ما يدل على شخص ونُبقي الإحصاءات كاملة
create or replace function public.anonymize_old_surveys(p_months int default 24)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  -- التنفيذ اليدوي للأدمن غير المقيّد فقط؛ الجدولة التلقائية (بدون مستخدم) مسموحة
  if auth.uid() is not null and not (is_admin() and not is_restricted()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update customer_surveys
     set contact_phone = null, comment = null, device_hash = null, ip_hash = null, trip_number = null
   where created_at < now() - make_interval(months => p_months)
     and (contact_phone is not null or comment is not null or device_hash is not null
          or ip_hash is not null or trip_number is not null);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.anonymize_old_surveys(int) from public, anon;
grant execute on function public.anonymize_old_surveys(int) to authenticated;

-- (اختياري) جدولة أسبوعية كل أحد 3 فجراً — تحتاج تفعيل إضافة pg_cron من Database → Extensions
-- select cron.schedule('anonymize-old-surveys', '0 3 * * 0', $$ select public.anonymize_old_surveys(24) $$);

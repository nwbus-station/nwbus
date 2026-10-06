-- حذف بيانات الاستبيان الأقدم من 24 شهراً (سياسة الخصوصية تعد بذلك)
create or replace function public.purge_old_surveys(p_months int default 24)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  -- التنفيذ اليدوي للأدمن غير المقيّد فقط؛ الجدولة التلقائية (بدون مستخدم) مسموحة
  if auth.uid() is not null and not (is_admin() and not is_restricted()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from customer_surveys where created_at < now() - make_interval(months => p_months);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.purge_old_surveys(int) from public, anon;
grant execute on function public.purge_old_surveys(int) to authenticated;

-- (اختياري) جدولة أسبوعية كل أحد 3 فجراً — تحتاج تفعيل إضافة pg_cron من Database → Extensions
-- select cron.schedule('purge-old-surveys', '0 3 * * 0', $$ select public.purge_old_surveys(24) $$);

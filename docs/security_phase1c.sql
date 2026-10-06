-- فحص "هل حسابي لسا نشط؟" — يعمل حتى لو الحساب معطّل (ما يعتمد على قراءة جدول users)
-- التطبيق يستدعيه كل نصف دقيقة وعند الرجوع للتبويب، فيطلّع الموظف المعطّل فوراً
create or replace function public.my_account_active()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from users where auth_id = auth.uid()), true)
$$;

revoke all on function public.my_account_active() from public, anon;
grant execute on function public.my_account_active() to authenticated;

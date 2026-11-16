-- شاشات المحطات: نداء خفيف كل بضع ثوانٍ لالتقاط أوامر الإدارة فوراً (لقطة، إعادة تشغيل، إيقاف، طوارئ)
-- بدل انتظار تحديث القائمة الكامل (30 ثانية). لا يكتب شيئاً في القاعدة. يتطلب 030 و031.

create or replace function public.signage_ping(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d public.signage_devices; c0 public.signage_control; e public.signage_emergency;
begin
  d := public.signage_device_of(p_secret);
  if d.id is null then raise exception 'unauthorized'; end if;
  select * into c0 from public.signage_control where id = 1;
  select * into e from public.signage_emergency where id = 1;
  return jsonb_build_object('reload', d.reload_nonce, 'snap', d.snap_requested_at is not null,
    'halted', coalesce(c0.halted, false) or d.paused,
    'emergency', coalesce(e.active and (e.ends_at is null or e.ends_at > now()), false));
end $$;
revoke all on function public.signage_ping(text) from public;
grant execute on function public.signage_ping(text) to anon, authenticated;

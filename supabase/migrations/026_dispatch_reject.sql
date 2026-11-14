-- رفض الإرسالية عند الاستلام: لا يرفضها إلا مشرف محطة الوصول (محطة/وردية/منطقة) أو الأدمن؛ الموظف العادي يستلم فقط.
-- يُرسل إشعار لموظفي المحطة المرسِلة وللمنشئ وللإدارة. تُشغَّل بعد 025. شغّل كل كتلة بشكل منفصل بالترتيب.

-- ═════ 1) أعمدة وقيود ═════
alter table public.dispatch_legs
  add column if not exists reject_reason    text,
  add column if not exists rejected_by      uuid references public.users(id) on delete set null,
  add column if not exists rejected_by_name text,
  add column if not exists rejected_at      timestamptz;

alter table public.dispatch_legs drop constraint if exists dispatch_legs_status_check;
alter table public.dispatch_legs add  constraint dispatch_legs_status_check check (status in ('pending', 'sent', 'received', 'rejected'));
alter table public.dispatches drop constraint if exists dispatches_status_check;
alter table public.dispatches add  constraint dispatches_status_check check (status in ('in_transit', 'awaiting_leg2', 'received', 'rejected'));

-- ═════ 2) دالة الرفض ═════
create or replace function public.dispatch_leg_reject(p_leg uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.users;
  lg public.dispatch_legs;
  d public.dispatches;
  body text;
  rsn text := nullif(trim(coalesce(p_reason, '')), '');
begin
  me := public.dsp_user();
  if me.id is null then raise exception 'not allowed' using errcode = '28000'; end if;
  if rsn is null then raise exception 'reason required'; end if;
  select * into lg from public.dispatch_legs where id = p_leg for update;
  if not found then raise exception 'leg not found'; end if;
  -- الرفض للمشرفين والأدمن فقط (وللمشرف: محطة الوصول نفسها)
  if not (public.dsp_is_admin(me.role::text)
          or (me.role::text in ('station_admin', 'shift_supervisor', 'area_supervisor') and public.dsp_can_act(me.id, me.role::text, lg.to_station_id))) then
    raise exception 'only supervisors can reject' using errcode = '42501';
  end if;
  if lg.status <> 'sent' then raise exception 'leg is not in transit'; end if;
  select * into d from public.dispatches where id = lg.dispatch_id for update;

  update public.dispatch_legs set status = 'rejected', reject_reason = left(rsn, 500), rejected_by = me.id, rejected_by_name = coalesce(me.full_name_ar, ''), rejected_at = now() where id = lg.id;
  -- الخطوط اللاحقة المعلّقة تُلغى
  update public.dispatch_legs set status = 'rejected', reject_reason = 'أُلغي لرفض الخط السابق', rejected_at = now()
   where dispatch_id = d.id and leg_no > lg.leg_no and status = 'pending';
  update public.dispatches set status = 'rejected', closed_at = now(), escalation_level = 2, escalated_at = now(), escalation_reason = 'رُفضت: ' || left(rsn, 300) where id = d.id;

  body := 'رقم التذكرة: ' || d.ticket_no
       || E'\nرُفضت في: ' || public.dsp_st_name(lg.to_station_id)
       || E'\nرفضها: ' || coalesce(me.full_name_ar, '')
       || E'\nالسبب: ' || left(rsn, 300)
       || E'\nالوقت: ' || public.dsp_stamp();
  perform public.dsp_notify_station(lg.from_station_id, me.id, 'رُفضت الإرسالية', body, 'warning', d.id);
  if d.created_by is not null and d.created_by <> me.id then
    perform public.dsp_notify_user(d.created_by, 'رُفضت إرسالياتك', body, 'warning', d.id);
  end if;
  perform public.dsp_notify_admins(me.id, 'رفض إرسالية', body, 'warning', d.id);
  return jsonb_build_object('id', d.id, 'ticket_no', d.ticket_no, 'status', 'rejected');
end $$;

-- ═════ 3) الصلاحيات ═════
revoke all on function public.dispatch_leg_reject(uuid, text) from public, anon;
grant execute on function public.dispatch_leg_reject(uuid, text) to authenticated;

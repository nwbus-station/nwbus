-- الإرساليات v2 (قسم مستقل): نوع «شحنة» مع بيانات المرسِل/المستلِم، أولوية عاجلة، استلام بحالة (سليمة/بها ملاحظة)،
-- تصعيد يدوي وتلقائي للمتأخر. تُشغَّل بعد 024. شغّل كل كتلة (مفصولة بسطر ═══) بشكل منفصل بالترتيب.

-- ═════ 1) أعمدة وقيود جديدة ═════
alter table public.dispatches
  add column if not exists recipient_name    text,
  add column if not exists recipient_phone   text,
  add column if not exists sender_name       text,
  add column if not exists sender_phone      text,
  add column if not exists priority          text not null default 'normal',
  add column if not exists escalation_level  int  not null default 0,
  add column if not exists escalated_at      timestamptz,
  add column if not exists escalation_reason text;

alter table public.dispatches drop constraint if exists dispatches_kind_check;
alter table public.dispatches add  constraint dispatches_kind_check check (kind in ('found', 'lost', 'shipment'));
alter table public.dispatches drop constraint if exists dispatches_priority_check;
alter table public.dispatches add  constraint dispatches_priority_check check (priority in ('normal', 'urgent'));

alter table public.dispatch_legs
  add column if not exists receive_condition text,
  add column if not exists receive_note      text,
  add column if not exists escalated_level   int not null default 0,
  add column if not exists escalated_at      timestamptz;
alter table public.dispatch_legs drop constraint if exists dispatch_legs_receive_condition_check;
alter table public.dispatch_legs add  constraint dispatch_legs_receive_condition_check check (receive_condition is null or receive_condition in ('ok', 'issue'));

create index if not exists idx_dispatches_status on public.dispatches(status, created_at desc);
create index if not exists idx_dispatch_legs_from on public.dispatch_legs(from_station_id, status);

-- ═════ 2) إشعار الأدمن ومشرفي المحطة (داخلي) ═════
create or replace function public.dsp_notify_admins(p_exclude uuid, p_title text, p_body text, p_type text, p_ref uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, title, body, type, ref_type, ref_id)
  select u.id, p_title, p_body, p_type, 'dispatch', p_ref
  from public.users u
  where u.is_active and u.role::text in ('general_admin', 'stations_executive_director', 'assistant_stations_executive_director')
    and (p_exclude is null or u.id <> p_exclude);
exception when others then
  raise warning 'dsp_notify_admins failed: %', sqlerrm;
end $$;

create or replace function public.dsp_notify_supervisors(p_station uuid, p_exclude uuid, p_title text, p_body text, p_type text, p_ref uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, title, body, type, ref_type, ref_id)
  select u.id, p_title, p_body, p_type, 'dispatch', p_ref
  from public.users u
  where u.is_active and u.role::text in ('station_admin', 'shift_supervisor', 'area_supervisor')
    and (p_exclude is null or u.id <> p_exclude)
    and (u.station_id = p_station or exists (select 1 from public.user_stations us where us.user_id = u.id and us.station_id = p_station));
exception when others then
  raise warning 'dsp_notify_supervisors failed: %', sqlerrm;
end $$;

revoke all on function public.dsp_notify_admins(uuid, text, text, text, uuid), public.dsp_notify_supervisors(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;

-- ═════ 3) إنشاء إرسالية (تحل محل النسخة القديمة): + شحنة + أولوية + بيانات المرسِل/المستلِم ═════
drop function if exists public.dispatch_create(text, uuid, uuid, text, uuid, text, jsonb, uuid);

create or replace function public.dispatch_create(
  p_kind text, p_from uuid, p_to uuid, p_bus text,
  p_to2 uuid default null, p_note text default null, p_items jsonb default '[]'::jsonb, p_request uuid default null,
  p_party jsonb default null, p_priority text default 'normal'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.users;
  d public.dispatches;
  it jsonb;
  req public.dispatch_requests;
  body text;
  ttl text;
  n int := 0;
begin
  me := public.dsp_user();
  if me.id is null then raise exception 'not allowed' using errcode = '28000'; end if;
  if p_kind not in ('found', 'lost', 'shipment') then raise exception 'bad kind'; end if;
  if coalesce(p_priority, 'normal') not in ('normal', 'urgent') then raise exception 'bad priority'; end if;
  if p_from is null or p_to is null or p_from = p_to then raise exception 'bad route'; end if;
  if p_to2 is not null and (p_to2 = p_to or p_to2 = p_from) then raise exception 'bad second leg'; end if;
  if not public.dsp_can_act(me.id, me.role::text, p_from) then raise exception 'not allowed for this station' using errcode = '42501'; end if;
  if coalesce(trim(p_bus), '') = '' then raise exception 'bus number required'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'items required'; end if;

  insert into public.dispatches (kind, note, request_id, created_by, created_by_name, status, priority,
                                 recipient_name, recipient_phone, sender_name, sender_phone)
  values (p_kind, nullif(trim(coalesce(p_note, '')), ''), p_request, me.id, coalesce(me.full_name_ar, ''), 'in_transit', coalesce(p_priority, 'normal'),
          left(nullif(trim(coalesce(p_party->>'recipient_name', '')), ''), 120), left(nullif(trim(coalesce(p_party->>'recipient_phone', '')), ''), 30),
          left(nullif(trim(coalesce(p_party->>'sender_name', '')), ''), 120),    left(nullif(trim(coalesce(p_party->>'sender_phone', '')), ''), 30))
  returning * into d;

  insert into public.dispatch_legs (dispatch_id, leg_no, from_station_id, to_station_id, bus_number, status, sent_by, sent_by_name, sent_at)
  values (d.id, 1, p_from, p_to, trim(p_bus), 'sent', me.id, coalesce(me.full_name_ar, ''), now());
  if p_to2 is not null then
    insert into public.dispatch_legs (dispatch_id, leg_no, from_station_id, to_station_id, status) values (d.id, 2, p_to, p_to2, 'pending');
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce(trim(it->>'description'), '') = '' then continue; end if;
    insert into public.dispatch_items (dispatch_id, ref_type, ref_id, description, qty)
    values (d.id,
            case when it->>'ref_type' in ('found', 'report') then it->>'ref_type' else 'free' end,
            nullif(it->>'ref_id', '')::uuid,
            left(trim(it->>'description'), 300),
            greatest(1, coalesce(nullif(it->>'qty', '')::int, 1)));
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'items required'; end if;

  if p_request is not null then
    select * into req from public.dispatch_requests where id = p_request and status = 'open' for update;
    if found then
      update public.dispatch_requests set status = 'fulfilled', dispatch_id = d.id, handled_by_name = me.full_name_ar, handled_at = now() where id = req.id;
      perform public.dsp_notify_user(req.requester_id, 'تم تنفيذ طلب الإرسال',
        'الغرض: ' || req.item_desc || E'\nرقم التذكرة: ' || d.ticket_no || E'\nمن: ' || public.dsp_st_name(p_from) || E'\nإلى: ' || public.dsp_st_name(p_to)
        || E'\nالمنفِّذ: ' || coalesce(me.full_name_ar, '') || E'\nالوقت: ' || public.dsp_stamp(), 'success', d.id);
    end if;
  end if;

  ttl := case p_kind when 'lost' then 'إرسالية مفقودات في الطريق إلى محطتكم' when 'shipment' then 'شحنة في الطريق إلى محطتكم' else 'إرسالية موجودات في الطريق إلى محطتكم' end;
  if d.priority = 'urgent' then ttl := 'عاجل: ' || ttl; end if;
  body := 'رقم التذكرة: ' || d.ticket_no
       || E'\nمن: ' || public.dsp_st_name(p_from) || E'\nإلى: ' || public.dsp_st_name(p_to)
       || case when p_to2 is not null then E'\nثم: ' || public.dsp_st_name(p_to2) else '' end
       || E'\nالمرسِل: ' || coalesce(me.full_name_ar, '')
       || E'\nالحافلة: ' || trim(p_bus)
       || case when d.recipient_name is not null then E'\nالمستلِم: ' || d.recipient_name else '' end
       || E'\nالوقت: ' || public.dsp_stamp();
  perform public.dsp_notify_station(p_to, me.id, ttl, body, case when d.priority = 'urgent' then 'warning' else 'info' end, d.id);

  return jsonb_build_object('id', d.id, 'ticket_no', d.ticket_no);
end $$;

-- ═════ 4) استلام الخط (تحل محل القديمة): حالة الاستلام سليمة/بها ملاحظة، والملاحظة تُصعَّد للإدارة تلقائياً ═════
drop function if exists public.dispatch_leg_receive(uuid);

create or replace function public.dispatch_leg_receive(p_leg uuid, p_condition text default 'ok', p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.users;
  lg public.dispatch_legs;
  d public.dispatches;
  has_next boolean;
  body text;
  cond text := coalesce(p_condition, 'ok');
  nt text := nullif(trim(coalesce(p_note, '')), '');
begin
  me := public.dsp_user();
  if me.id is null then raise exception 'not allowed' using errcode = '28000'; end if;
  if cond not in ('ok', 'issue') then raise exception 'bad condition'; end if;
  if cond = 'issue' and nt is null then raise exception 'note required'; end if;
  select * into lg from public.dispatch_legs where id = p_leg for update;
  if not found then raise exception 'leg not found'; end if;
  if not public.dsp_can_act(me.id, me.role::text, lg.to_station_id) then raise exception 'not allowed for this station' using errcode = '42501'; end if;
  if lg.status <> 'sent' then raise exception 'leg is not in transit'; end if;
  select * into d from public.dispatches where id = lg.dispatch_id for update;

  update public.dispatch_legs set status = 'received', received_by = me.id, received_by_name = coalesce(me.full_name_ar, ''), received_at = now(),
         receive_condition = cond, receive_note = left(nt, 500) where id = lg.id;
  select exists (select 1 from public.dispatch_legs where dispatch_id = d.id and leg_no > lg.leg_no and status = 'pending') into has_next;
  if has_next then
    update public.dispatches set status = 'awaiting_leg2' where id = d.id;
  else
    update public.dispatches set status = 'received', closed_at = now() where id = d.id;
  end if;

  body := 'رقم التذكرة: ' || d.ticket_no
       || E'\nاستُلمت في: ' || public.dsp_st_name(lg.to_station_id)
       || E'\nالمستلِم: ' || coalesce(me.full_name_ar, '')
       || E'\nالوقت: ' || public.dsp_stamp()
       || case when cond = 'issue' then E'\nبملاحظة: ' || left(nt, 300) else '' end
       || case when has_next then E'\nبانتظار إرسال الخط الثاني' else '' end;
  perform public.dsp_notify_station(lg.from_station_id, me.id,
    case when cond = 'issue' then 'استُلمت الإرسالية بملاحظات' when has_next then 'وصلت الإرسالية لمحطة التحويل' else 'تم استلام الإرسالية' end,
    body, case when cond = 'issue' then 'warning' else 'success' end, d.id);
  if d.created_by is not null and d.created_by <> me.id then
    perform public.dsp_notify_user(d.created_by, case when cond = 'issue' then 'استُلمت إرسالياتك بملاحظات' when has_next then 'وصلت إرسالياتك لمحطة التحويل' else 'تم استلام إرسالياتك' end,
      body, case when cond = 'issue' then 'warning' else 'success' end, d.id);
  end if;
  -- ملاحظة عند الاستلام = تصعيد تلقائي للإدارة ومشرفي المحطة المرسِلة
  if cond = 'issue' then
    update public.dispatches set escalation_level = 2, escalated_at = now(), escalation_reason = 'استلام بملاحظات: ' || left(nt, 300) where id = d.id;
    perform public.dsp_notify_admins(me.id, 'تصعيد: إرسالية استُلمت بملاحظات', body, 'warning', d.id);
    perform public.dsp_notify_supervisors(lg.from_station_id, me.id, 'تصعيد: إرسالية استُلمت بملاحظات', body, 'warning', d.id);
  end if;
  return jsonb_build_object('id', d.id, 'ticket_no', d.ticket_no, 'status', case when has_next then 'awaiting_leg2' else 'received' end);
end $$;

-- ═════ 5) تصعيد يدوي ═════
create or replace function public.dispatch_escalate_manual(p_dispatch uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.users;
  d public.dispatches;
  lg public.dispatch_legs;
  ok boolean := false;
  body text;
begin
  me := public.dsp_user();
  if me.id is null then raise exception 'not allowed' using errcode = '28000'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason required'; end if;
  select * into d from public.dispatches where id = p_dispatch for update;
  if not found then raise exception 'dispatch not found'; end if;
  for lg in select * from public.dispatch_legs where dispatch_id = d.id loop
    if public.dsp_can_act(me.id, me.role::text, lg.from_station_id) or public.dsp_can_act(me.id, me.role::text, lg.to_station_id) then ok := true; end if;
  end loop;
  if not ok then raise exception 'not allowed' using errcode = '42501'; end if;

  update public.dispatches set escalation_level = 2, escalated_at = now(), escalation_reason = left(trim(p_reason), 500) where id = d.id;
  body := 'رقم التذكرة: ' || d.ticket_no || E'\nالسبب: ' || left(trim(p_reason), 300)
       || E'\nصعّدها: ' || coalesce(me.full_name_ar, '') || E'\nالوقت: ' || public.dsp_stamp();
  perform public.dsp_notify_admins(me.id, 'تصعيد إرسالية', body, 'warning', d.id);
  for lg in select * from public.dispatch_legs where dispatch_id = d.id loop
    perform public.dsp_notify_supervisors(lg.from_station_id, me.id, 'تصعيد إرسالية', body, 'warning', d.id);
    perform public.dsp_notify_supervisors(lg.to_station_id, me.id, 'تصعيد إرسالية', body, 'warning', d.id);
  end loop;
  return jsonb_build_object('id', d.id, 'ticket_no', d.ticket_no);
end $$;

-- ═════ 6) تصعيد تلقائي للمتأخر (آمنة ومتكررة بدون تكرار الإشعارات؛ يستدعيها التطبيق دورياً) ═════
-- المستوى 1 بعد p_l1 ساعة: تنبيه موظفي المحطة المعنية · المستوى 2 بعد p_l2 ساعة: الإدارة ومشرفو المحطتين
create or replace function public.dispatch_escalate_overdue(p_l1 int default 8, p_l2 int default 24) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  lg public.dispatch_legs;
  d public.dispatches;
  prev_at timestamptz;
  body text;
  n1 int := 0;
  n2 int := 0;
begin
  if public.dsp_user() is null then raise exception 'not allowed' using errcode = '28000'; end if;

  -- مستوى 2: خط مرسَل ولم يُستلم بعد p_l2 ساعة
  for lg in select * from public.dispatch_legs where status = 'sent' and sent_at < now() - make_interval(hours => p_l2) and escalated_level < 2 for update skip locked loop
    select * into d from public.dispatches where id = lg.dispatch_id;
    body := 'رقم التذكرة: ' || d.ticket_no || E'\nمن: ' || public.dsp_st_name(lg.from_station_id) || E'\nإلى: ' || public.dsp_st_name(lg.to_station_id)
         || E'\nالحافلة: ' || coalesce(lg.bus_number, '—') || E'\nأُرسلت منذ: ' || (extract(epoch from (now() - lg.sent_at)) / 3600)::int || ' ساعة بدون استلام';
    perform public.dsp_notify_admins(null, 'تصعيد: إرسالية متأخرة جداً', body, 'warning', d.id);
    perform public.dsp_notify_supervisors(lg.to_station_id, null, 'تصعيد: إرسالية متأخرة جداً', body, 'warning', d.id);
    perform public.dsp_notify_supervisors(lg.from_station_id, null, 'تصعيد: إرسالية متأخرة جداً', body, 'warning', d.id);
    update public.dispatch_legs set escalated_level = 2, escalated_at = now() where id = lg.id;
    update public.dispatches set escalation_level = 2, escalated_at = coalesce(escalated_at, now()), escalation_reason = coalesce(escalation_reason, 'تأخر الاستلام') where id = d.id;
    n2 := n2 + 1;
  end loop;

  -- مستوى 1: خط مرسَل ولم يُستلم بعد p_l1 ساعة
  for lg in select * from public.dispatch_legs where status = 'sent' and sent_at < now() - make_interval(hours => p_l1) and escalated_level < 1 for update skip locked loop
    select * into d from public.dispatches where id = lg.dispatch_id;
    body := 'رقم التذكرة: ' || d.ticket_no || E'\nمن: ' || public.dsp_st_name(lg.from_station_id) || E'\nالحافلة: ' || coalesce(lg.bus_number, '—')
         || E'\nأُرسلت منذ: ' || (extract(epoch from (now() - lg.sent_at)) / 3600)::int || ' ساعة — يرجى الاستلام أو التواصل';
    perform public.dsp_notify_station(lg.to_station_id, null, 'تنبيه: إرسالية لم تُستلم بعد', body, 'warning', d.id);
    update public.dispatch_legs set escalated_level = 1, escalated_at = now() where id = lg.id;
    update public.dispatches set escalation_level = greatest(escalation_level, 1), escalated_at = coalesce(escalated_at, now()) where id = d.id;
    n1 := n1 + 1;
  end loop;

  -- خط ثانٍ معلّق في محطة التحويل بعد استلام الأول بأكثر من p_l1 ساعة
  for lg in select * from public.dispatch_legs where status = 'pending' and leg_no > 1 and escalated_level < 1 for update skip locked loop
    select received_at into prev_at from public.dispatch_legs where dispatch_id = lg.dispatch_id and leg_no = lg.leg_no - 1 and status = 'received';
    if prev_at is not null and prev_at < now() - make_interval(hours => p_l1) then
      select * into d from public.dispatches where id = lg.dispatch_id;
      body := 'رقم التذكرة: ' || d.ticket_no || E'\nإلى: ' || public.dsp_st_name(lg.to_station_id) || E'\nبانتظار إرسال الخط الثاني منذ ' || (extract(epoch from (now() - prev_at)) / 3600)::int || ' ساعة';
      perform public.dsp_notify_station(lg.from_station_id, null, 'تنبيه: إرسالية بانتظار إرسالها من محطتكم', body, 'warning', d.id);
      update public.dispatch_legs set escalated_level = 1, escalated_at = now() where id = lg.id;
      update public.dispatches set escalation_level = greatest(escalation_level, 1), escalated_at = coalesce(escalated_at, now()) where id = d.id;
      n1 := n1 + 1;
    end if;
  end loop;

  return jsonb_build_object('level1', n1, 'level2', n2);
end $$;

-- ═════ 7) الصلاحيات ═════
revoke all on function public.dispatch_create(text, uuid, uuid, text, uuid, text, jsonb, uuid, jsonb, text) from public, anon;
revoke all on function public.dispatch_leg_receive(uuid, text, text) from public, anon;
revoke all on function public.dispatch_escalate_manual(uuid, text) from public, anon;
revoke all on function public.dispatch_escalate_overdue(int, int) from public, anon;
grant execute on function public.dispatch_create(text, uuid, uuid, text, uuid, text, jsonb, uuid, jsonb, text) to authenticated;
grant execute on function public.dispatch_leg_receive(uuid, text, text) to authenticated;
grant execute on function public.dispatch_escalate_manual(uuid, text) to authenticated;
grant execute on function public.dispatch_escalate_overdue(int, int) to authenticated;

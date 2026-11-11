-- الإرساليات: نقل الموجودات/المفقودات بين المحطات بخط إرسال (خط أول وخط ثانٍ اختياري)، مع رقم تذكرة،
-- إشعار تلقائي لموظفي المحطة المستقبِلة، ملاحظات الأدمن، وطلبات الإرسال من قسم الموجودات.
-- شغّل كل كتلة (مفصولة بسطر ═══) بشكل منفصل في Supabase SQL Editor، بالترتيب.

-- ═════ 1) الجداول والصلاحيات ═════
create sequence if not exists public.dispatch_seq start 1;

create table if not exists public.dispatches (
  id              uuid primary key default gen_random_uuid(),
  ticket_no       text not null unique,
  kind            text not null default 'found' check (kind in ('found', 'lost')),
  status          text not null default 'in_transit' check (status in ('in_transit', 'awaiting_leg2', 'received')),
  note            text,
  request_id      uuid,
  created_by      uuid references public.users(id) on delete set null,
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  closed_at       timestamptz
);

create table if not exists public.dispatch_legs (
  id               uuid primary key default gen_random_uuid(),
  dispatch_id      uuid not null references public.dispatches(id) on delete cascade,
  leg_no           int  not null check (leg_no in (1, 2)),
  from_station_id  uuid not null references public.stations(id),
  to_station_id    uuid not null references public.stations(id),
  bus_number       text,
  status           text not null default 'pending' check (status in ('pending', 'sent', 'received')),
  sent_by          uuid references public.users(id) on delete set null,
  sent_by_name     text,
  sent_at          timestamptz,
  received_by      uuid references public.users(id) on delete set null,
  received_by_name text,
  received_at      timestamptz,
  unique (dispatch_id, leg_no),
  check (from_station_id <> to_station_id)
);

create table if not exists public.dispatch_items (
  id           uuid primary key default gen_random_uuid(),
  dispatch_id  uuid not null references public.dispatches(id) on delete cascade,
  ref_type     text not null default 'free' check (ref_type in ('found', 'report', 'free')),
  ref_id       uuid,
  description  text not null,
  qty          int not null default 1 check (qty > 0)
);

create table if not exists public.dispatch_notes (
  id           uuid primary key default gen_random_uuid(),
  dispatch_id  uuid not null references public.dispatches(id) on delete cascade,
  author_id    uuid references public.users(id) on delete set null,
  author_name  text not null default '',
  body         text not null,
  created_at   timestamptz not null default now()
);

create table if not exists public.dispatch_requests (
  id                   uuid primary key default gen_random_uuid(),
  ref_type             text not null check (ref_type in ('found', 'report')),
  ref_id               uuid not null,
  item_desc            text not null default '',
  holder_station_id    uuid not null references public.stations(id),
  to_station_id        uuid not null references public.stations(id),
  requester_id         uuid references public.users(id) on delete set null,
  requester_name       text not null default '',
  requester_station_id uuid references public.stations(id),
  note                 text,
  status               text not null default 'open' check (status in ('open', 'fulfilled', 'dismissed')),
  dispatch_id          uuid references public.dispatches(id) on delete set null,
  created_at           timestamptz not null default now(),
  handled_by_name      text,
  handled_at           timestamptz,
  check (holder_station_id <> to_station_id)
);

create index if not exists idx_dispatch_legs_dispatch on public.dispatch_legs(dispatch_id);
create index if not exists idx_dispatch_legs_to       on public.dispatch_legs(to_station_id, status);
create index if not exists idx_dispatch_items_ref     on public.dispatch_items(ref_id);
create index if not exists idx_dispatch_items_disp    on public.dispatch_items(dispatch_id);
create index if not exists idx_dispatch_notes_disp    on public.dispatch_notes(dispatch_id);
create index if not exists idx_dispatch_req_status    on public.dispatch_requests(status, holder_station_id);

-- ترقيم التذكرة تلقائياً: NWD-000001
create or replace function public.dsp_set_ticket() returns trigger language plpgsql as $$
begin
  if new.ticket_no is null or new.ticket_no = '' then
    new.ticket_no := 'NWD-' || lpad(nextval('public.dispatch_seq')::text, 6, '0');
  end if;
  return new;
end $$;
drop trigger if exists trg_dsp_ticket on public.dispatches;
create trigger trg_dsp_ticket before insert on public.dispatches for each row execute function public.dsp_set_ticket();

-- القراءة لكل مستخدم مسجَّل (كقسم الموجودات)، والكتابة فقط عبر الدوال أدناه؛ الحذف للأدمن العام
alter table public.dispatches         enable row level security;
alter table public.dispatch_legs      enable row level security;
alter table public.dispatch_items     enable row level security;
alter table public.dispatch_notes     enable row level security;
alter table public.dispatch_requests  enable row level security;

drop policy if exists dsp_sel  on public.dispatches;        create policy dsp_sel  on public.dispatches        for select using (auth.uid() is not null);
drop policy if exists dspl_sel on public.dispatch_legs;     create policy dspl_sel on public.dispatch_legs     for select using (auth.uid() is not null);
drop policy if exists dspi_sel on public.dispatch_items;    create policy dspi_sel on public.dispatch_items    for select using (auth.uid() is not null);
drop policy if exists dspn_sel on public.dispatch_notes;    create policy dspn_sel on public.dispatch_notes    for select using (auth.uid() is not null);
drop policy if exists dspr_sel on public.dispatch_requests; create policy dspr_sel on public.dispatch_requests for select using (auth.uid() is not null);
drop policy if exists dsp_del  on public.dispatches;        create policy dsp_del  on public.dispatches        for delete using (exists (select 1 from public.users u where u.auth_id = auth.uid() and u.role = 'general_admin'));
drop policy if exists dspr_del on public.dispatch_requests; create policy dspr_del on public.dispatch_requests for delete using (exists (select 1 from public.users u where u.auth_id = auth.uid() and u.role = 'general_admin'));

grant select on public.dispatches, public.dispatch_legs, public.dispatch_items, public.dispatch_notes, public.dispatch_requests to authenticated;
grant delete on public.dispatches, public.dispatch_requests to authenticated;

-- ═════ 2) دوال مساعدة داخلية (لا تُستدعى من التطبيق) ═════
create or replace function public.dsp_user() returns public.users
language sql security definer stable set search_path = public as $$
  select * from public.users where auth_id = auth.uid() and is_active limit 1
$$;

create or replace function public.dsp_is_admin(p_role text) returns boolean
language sql immutable as $$
  select p_role in ('general_admin', 'stations_executive_director', 'assistant_stations_executive_director')
$$;

-- هل المستخدم يعمل في هذه المحطة (الأساسية أو الإضافية)، أو أدمن؟
create or replace function public.dsp_can_act(p_user_id uuid, p_role text, p_station uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select public.dsp_is_admin(p_role)
      or exists (select 1 from public.users u where u.id = p_user_id and u.station_id = p_station)
      or exists (select 1 from public.user_stations us where us.user_id = p_user_id and us.station_id = p_station)
$$;

create or replace function public.dsp_st_name(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(name_ar, ''), name_en, '—') from public.stations where id = p_id
$$;

create or replace function public.dsp_stamp() returns text
language sql stable as $$
  select to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI')
$$;

-- إشعار لكل موظفي المحطة النشطين (الأساسية أو الإضافية) ما عدا من قام بالإجراء؛ فشل الإشعار لا يوقف العملية
create or replace function public.dsp_notify_station(p_station uuid, p_exclude uuid, p_title text, p_body text, p_type text, p_ref uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, title, body, type, ref_type, ref_id)
  select u.id, p_title, p_body, p_type, 'dispatch', p_ref
  from public.users u
  where u.is_active
    and (p_exclude is null or u.id <> p_exclude)
    and (u.station_id = p_station or exists (select 1 from public.user_stations us where us.user_id = u.id and us.station_id = p_station));
exception when others then
  raise warning 'dsp_notify_station failed: %', sqlerrm;
end $$;

create or replace function public.dsp_notify_user(p_user uuid, p_title text, p_body text, p_type text, p_ref uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, title, body, type, ref_type, ref_id) values (p_user, p_title, p_body, p_type, 'dispatch', p_ref);
exception when others then
  raise warning 'dsp_notify_user failed: %', sqlerrm;
end $$;

revoke all on function public.dsp_user(), public.dsp_is_admin(text), public.dsp_can_act(uuid, text, uuid), public.dsp_st_name(uuid), public.dsp_stamp(),
  public.dsp_notify_station(uuid, uuid, text, text, text, uuid), public.dsp_notify_user(uuid, text, text, text, uuid) from public, anon, authenticated;

-- ═════ 3) إنشاء إرسالية ═════
create or replace function public.dispatch_create(
  p_kind text, p_from uuid, p_to uuid, p_bus text,
  p_to2 uuid default null, p_note text default null, p_items jsonb default '[]'::jsonb, p_request uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.users;
  d public.dispatches;
  it jsonb;
  req public.dispatch_requests;
  body text;
  n int := 0;
begin
  me := public.dsp_user();
  if me.id is null then raise exception 'not allowed' using errcode = '28000'; end if;
  if p_kind not in ('found', 'lost') then raise exception 'bad kind'; end if;
  if p_from is null or p_to is null or p_from = p_to then raise exception 'bad route'; end if;
  if p_to2 is not null and (p_to2 = p_to or p_to2 = p_from) then raise exception 'bad second leg'; end if;
  if not public.dsp_can_act(me.id, me.role, p_from) then raise exception 'not allowed for this station' using errcode = '42501'; end if;
  if coalesce(trim(p_bus), '') = '' then raise exception 'bus number required'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'items required'; end if;

  insert into public.dispatches (kind, note, request_id, created_by, created_by_name, status)
  values (p_kind, nullif(trim(coalesce(p_note, '')), ''), p_request, me.id, coalesce(me.full_name_ar, ''), 'in_transit')
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

  -- ربط طلب الإرسال (إن وُجد) وإشعار صاحب الطلب
  if p_request is not null then
    select * into req from public.dispatch_requests where id = p_request and status = 'open' for update;
    if found then
      update public.dispatch_requests set status = 'fulfilled', dispatch_id = d.id, handled_by_name = me.full_name_ar, handled_at = now() where id = req.id;
      perform public.dsp_notify_user(req.requester_id, 'تم تنفيذ طلب الإرسال',
        'الغرض: ' || req.item_desc || E'\nرقم التذكرة: ' || d.ticket_no || E'\nمن: ' || public.dsp_st_name(p_from) || E'\nإلى: ' || public.dsp_st_name(p_to)
        || E'\nالمنفِّذ: ' || coalesce(me.full_name_ar, '') || E'\nالوقت: ' || public.dsp_stamp(), 'success', d.id);
    end if;
  end if;

  -- إشعار موظفي المحطة المستقبِلة
  body := 'رقم التذكرة: ' || d.ticket_no
       || E'\nمن: ' || public.dsp_st_name(p_from) || E'\nإلى: ' || public.dsp_st_name(p_to)
       || case when p_to2 is not null then E'\nثم: ' || public.dsp_st_name(p_to2) else '' end
       || E'\nالمرسِل: ' || coalesce(me.full_name_ar, '')
       || E'\nالحافلة: ' || trim(p_bus)
       || E'\nالوقت: ' || public.dsp_stamp();
  perform public.dsp_notify_station(p_to, me.id,
    case when p_kind = 'lost' then 'إرسالية مفقودات في الطريق إلى محطتكم' else 'إرسالية موجودات في الطريق إلى محطتكم' end, body, 'info', d.id);

  return jsonb_build_object('id', d.id, 'ticket_no', d.ticket_no);
end $$;

-- ═════ 4) استلام خط الإرسالية في محطة الوصول ═════
create or replace function public.dispatch_leg_receive(p_leg uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.users;
  lg public.dispatch_legs;
  d public.dispatches;
  has_next boolean;
  body text;
begin
  me := public.dsp_user();
  if me.id is null then raise exception 'not allowed' using errcode = '28000'; end if;
  select * into lg from public.dispatch_legs where id = p_leg for update;
  if not found then raise exception 'leg not found'; end if;
  if not public.dsp_can_act(me.id, me.role, lg.to_station_id) then raise exception 'not allowed for this station' using errcode = '42501'; end if;
  if lg.status <> 'sent' then raise exception 'leg is not in transit'; end if;
  select * into d from public.dispatches where id = lg.dispatch_id for update;

  update public.dispatch_legs set status = 'received', received_by = me.id, received_by_name = coalesce(me.full_name_ar, ''), received_at = now() where id = lg.id;
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
       || case when has_next then E'\nبانتظار إرسال الخط الثاني' else '' end;
  perform public.dsp_notify_station(lg.from_station_id, me.id, case when has_next then 'وصلت الإرسالية لمحطة التحويل' else 'تم استلام الإرسالية' end, body, 'success', d.id);
  -- المرسِل الأصلي (إن كان في محطة أخرى عن مرسِل هذا الخط)
  if d.created_by is not null and d.created_by <> me.id then
    perform public.dsp_notify_user(d.created_by, case when has_next then 'وصلت إرسالياتك لمحطة التحويل' else 'تم استلام إرسالياتك' end, body, 'success', d.id);
  end if;
  return jsonb_build_object('id', d.id, 'ticket_no', d.ticket_no, 'status', case when has_next then 'awaiting_leg2' else 'received' end);
end $$;

-- ═════ 5) إرسال الخط الثاني من محطة التحويل ═════
create or replace function public.dispatch_leg_send(p_leg uuid, p_bus text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.users;
  lg public.dispatch_legs;
  d public.dispatches;
  prev public.dispatch_legs;
  body text;
begin
  me := public.dsp_user();
  if me.id is null then raise exception 'not allowed' using errcode = '28000'; end if;
  if coalesce(trim(p_bus), '') = '' then raise exception 'bus number required'; end if;
  select * into lg from public.dispatch_legs where id = p_leg for update;
  if not found then raise exception 'leg not found'; end if;
  if not public.dsp_can_act(me.id, me.role, lg.from_station_id) then raise exception 'not allowed for this station' using errcode = '42501'; end if;
  if lg.status <> 'pending' then raise exception 'leg already sent'; end if;
  select * into prev from public.dispatch_legs where dispatch_id = lg.dispatch_id and leg_no = lg.leg_no - 1;
  if lg.leg_no > 1 and (prev.id is null or prev.status <> 'received') then raise exception 'previous leg not received yet'; end if;
  select * into d from public.dispatches where id = lg.dispatch_id for update;

  update public.dispatch_legs set status = 'sent', bus_number = trim(p_bus), sent_by = me.id, sent_by_name = coalesce(me.full_name_ar, ''), sent_at = now() where id = lg.id;
  update public.dispatches set status = 'in_transit' where id = d.id;

  body := 'رقم التذكرة: ' || d.ticket_no
       || E'\nمن: ' || public.dsp_st_name(lg.from_station_id) || E'\nإلى: ' || public.dsp_st_name(lg.to_station_id)
       || E'\nالمرسِل: ' || coalesce(me.full_name_ar, '')
       || E'\nالحافلة: ' || trim(p_bus)
       || E'\nالوقت: ' || public.dsp_stamp();
  perform public.dsp_notify_station(lg.to_station_id, me.id, case when d.kind = 'lost' then 'إرسالية مفقودات في الطريق إلى محطتكم' else 'إرسالية موجودات في الطريق إلى محطتكم' end, body, 'info', d.id);
  return jsonb_build_object('id', d.id, 'ticket_no', d.ticket_no);
end $$;

-- ═════ 6) ملاحظة الأدمن ═════
create or replace function public.dispatch_add_note(p_dispatch uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.users;
  d public.dispatches;
  nt public.dispatch_notes;
begin
  me := public.dsp_user();
  if me.id is null or not public.dsp_is_admin(me.role) then raise exception 'not allowed' using errcode = '42501'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'empty note'; end if;
  select * into d from public.dispatches where id = p_dispatch;
  if not found then raise exception 'dispatch not found'; end if;
  insert into public.dispatch_notes (dispatch_id, author_id, author_name, body) values (d.id, me.id, coalesce(me.full_name_ar, ''), left(trim(p_body), 1000)) returning * into nt;
  if d.created_by is not null and d.created_by <> me.id then
    perform public.dsp_notify_user(d.created_by, 'ملاحظة من الإدارة على إرسالية', 'رقم التذكرة: ' || d.ticket_no || E'\n' || left(trim(p_body), 300) || E'\nالوقت: ' || public.dsp_stamp(), 'warning', d.id);
  end if;
  return to_jsonb(nt);
end $$;

-- ═════ 7) طلب إرسال لغرض موجود أو بلاغ مفقود (من قسم الموجودات) ═════
create or replace function public.dispatch_request_create(p_ref_type text, p_ref_id uuid, p_to uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.users;
  holder uuid;
  descr text;
  r public.dispatch_requests;
  body text;
begin
  me := public.dsp_user();
  if me.id is null then raise exception 'not allowed' using errcode = '28000'; end if;
  if p_ref_type = 'found' then
    select station_id, coalesce(item_description, '') into holder, descr from public.lost_found_items where id = p_ref_id;
  elsif p_ref_type = 'report' then
    select station_id, coalesce(item_description, '') into holder, descr from public.lost_reports where id = p_ref_id;
  else
    raise exception 'bad ref type';
  end if;
  if not found then raise exception 'item not found'; end if;
  if holder is null then raise exception 'item has no station'; end if;
  if p_to is null or p_to = holder then raise exception 'bad destination'; end if;
  if descr = '' then descr := case when p_ref_type = 'report' then 'بلاغ مفقود' else 'غرض' end; end if;
  if exists (select 1 from public.dispatch_requests where ref_type = p_ref_type and ref_id = p_ref_id and to_station_id = p_to and status = 'open') then
    raise exception 'request already open';
  end if;

  insert into public.dispatch_requests (ref_type, ref_id, item_desc, holder_station_id, to_station_id, requester_id, requester_name, requester_station_id, note)
  values (p_ref_type, p_ref_id, left(descr, 200), holder, p_to, me.id, coalesce(me.full_name_ar, ''), me.station_id, nullif(trim(coalesce(p_note, '')), ''))
  returning * into r;

  body := 'الغرض: ' || r.item_desc
       || E'\nطُلب من محطة: ' || coalesce(public.dsp_st_name(me.station_id), '—')
       || E'\nالموظف: ' || coalesce(me.full_name_ar, '')
       || E'\nالإرسال إلى محطة: ' || public.dsp_st_name(p_to)
       || E'\nوقت الطلب: ' || public.dsp_stamp()
       || case when r.note is not null then E'\nملاحظة: ' || r.note else '' end;
  perform public.dsp_notify_station(holder, me.id, 'طلب إرسال ' || case when p_ref_type = 'report' then 'بلاغ مفقود' else 'موجود' end, body, 'warning', r.id);
  return jsonb_build_object('id', r.id);
end $$;

create or replace function public.dispatch_request_dismiss(p_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.users;
  r public.dispatch_requests;
begin
  me := public.dsp_user();
  if me.id is null then raise exception 'not allowed' using errcode = '28000'; end if;
  select * into r from public.dispatch_requests where id = p_id for update;
  if not found then raise exception 'request not found'; end if;
  if not (public.dsp_can_act(me.id, me.role, r.holder_station_id) or r.requester_id = me.id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if r.status <> 'open' then raise exception 'request already handled'; end if;
  update public.dispatch_requests set status = 'dismissed', handled_by_name = coalesce(me.full_name_ar, ''), handled_at = now() where id = r.id;
  if r.requester_id is not null and r.requester_id <> me.id then
    perform public.dsp_notify_user(r.requester_id, 'تعذّر تنفيذ طلب الإرسال',
      'الغرض: ' || r.item_desc || E'\nالمحطة: ' || public.dsp_st_name(r.holder_station_id) || E'\nبواسطة: ' || coalesce(me.full_name_ar, '')
      || case when coalesce(trim(p_reason), '') <> '' then E'\nالسبب: ' || left(trim(p_reason), 200) else '' end || E'\nالوقت: ' || public.dsp_stamp(), 'warning', r.id);
  end if;
end $$;

-- ═════ 8) صلاحيات الدوال + التحديث اللحظي ═════
revoke all on function public.dispatch_create(text, uuid, uuid, text, uuid, text, jsonb, uuid) from public, anon;
revoke all on function public.dispatch_leg_receive(uuid) from public, anon;
revoke all on function public.dispatch_leg_send(uuid, text) from public, anon;
revoke all on function public.dispatch_add_note(uuid, text) from public, anon;
revoke all on function public.dispatch_request_create(text, uuid, uuid, text) from public, anon;
revoke all on function public.dispatch_request_dismiss(uuid, text) from public, anon;
grant execute on function public.dispatch_create(text, uuid, uuid, text, uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.dispatch_leg_receive(uuid) to authenticated;
grant execute on function public.dispatch_leg_send(uuid, text) to authenticated;
grant execute on function public.dispatch_add_note(uuid, text) to authenticated;
grant execute on function public.dispatch_request_create(text, uuid, uuid, text) to authenticated;
grant execute on function public.dispatch_request_dismiss(uuid, text) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['dispatches', 'dispatch_legs', 'dispatch_items', 'dispatch_notes', 'dispatch_requests'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;   -- مضافة مسبقاً أو النشر غير موجود
    end;
  end loop;
end $$;

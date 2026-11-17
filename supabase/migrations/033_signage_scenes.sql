-- شاشات المحطات (المرحلة 2): «المشاهد» (تقسيم الشاشة لمناطق: وسائط، شاشة العرض، عناصر جاهزة، شريط إخباري)
-- + الشريط الإخباري (رسائل نصية متحركة بجدولة واستهداف وموافقة).
-- يتطلب 027-032 ووجود الأعمدة lat/lng في جدول stations (قسم الخريطة). شغّل كل كتلة (مفصولة بسطر ═══) بشكل منفصل، بالترتيب.

-- ═════ 1) نوع محتوى «scene» + جدول الشريط الإخباري ═════
alter table public.signage_media drop constraint if exists signage_media_kind_check;
alter table public.signage_media add constraint signage_media_kind_check check (kind in ('image', 'video', 'board', 'scene'));

create table if not exists public.signage_tickers (
  id               uuid primary key default gen_random_uuid(),
  text             text not null check (length(btrim(text)) between 1 and 200),
  level            text not null default 'normal' check (level in ('normal', 'urgent')),
  scope            text not null default 'stations' check (scope in ('all', 'stations', 'devices')),
  station_ids      uuid[] not null default '{}',
  device_ids       uuid[] not null default '{}',
  starts_at        timestamptz,
  ends_at          timestamptz,
  days             int[],
  from_min         int check (from_min between 0 and 1439),
  to_min           int check (to_min between 0 and 1439),
  status           text not null default 'active' check (status in ('active', 'pending', 'rejected', 'paused')),
  created_by       uuid references public.users(id) on delete set null,
  created_by_name  text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  reviewed_by_name text,
  review_note      text,
  check ((from_min is null) = (to_min is null)),
  check (starts_at is null or ends_at is null or starts_at < ends_at)
);
create index if not exists idx_signage_tickers_status on public.signage_tickers(status);
alter table public.signage_tickers enable row level security;
drop policy if exists sgn_tk_sel on public.signage_tickers;
create policy sgn_tk_sel on public.signage_tickers for select to authenticated using (public.signage_role() is not null);
revoke all on public.signage_tickers from public, anon, authenticated;
grant select on public.signage_tickers to authenticated;

-- ═════ 2) حفظ المشهد (إنشاء/تعديل) مع تحقق صارم من الإعدادات ═════
create or replace function public.signage_scene_save(p_id uuid, p_title text, p_config jsonb, p_duration int default 30) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a public.users; r text; old public.signage_media; v_id uuid; v_layout text; v_theme text; v_city text;
  v_allowed text[]; v_zones jsonb := '{}'::jsonb; k text; z jsonb; zt text; v_items jsonb; it text; v_cfg jsonb;
begin
  r := public.signage_role();
  if r is null then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  if p_title is null or btrim(p_title) = '' or length(p_title) > 120 then raise exception 'title required'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'bad scene'; end if;
  v_layout := p_config ->> 'layout';
  v_allowed := case v_layout when 'full' then array['main'] when 'side' then array['main', 'side'] when 'bottom' then array['main', 'ticker'] when 'side_bottom' then array['main', 'side', 'ticker'] end;
  if v_allowed is null then raise exception 'bad scene layout'; end if;
  v_theme := coalesce(p_config ->> 'theme', 'nwb');
  if v_theme not in ('nwb', 'navy', 'black', 'teal') then raise exception 'bad board theme'; end if;
  v_city := nullif(left(coalesce(p_config ->> 'fallback_city', ''), 30), '');
  if v_city is not null and v_city !~ '^[a-z_]+$' then raise exception 'bad scene city'; end if;
  foreach k in array v_allowed loop
    z := p_config -> 'zones' -> k;
    if z is null or jsonb_typeof(z) <> 'object' then raise exception 'zone required'; end if;
    zt := z ->> 'type';
    if k = 'ticker' then
      if zt is distinct from 'ticker' then raise exception 'bad zone'; end if;
      v_zones := v_zones || jsonb_build_object(k, jsonb_build_object('type', 'ticker', 'speed', case when z ->> 'speed' in ('slow', 'normal', 'fast') then z ->> 'speed' else 'normal' end));
    elsif zt = 'media' then
      if not exists (select 1 from public.signage_media where id::text = z ->> 'media_id' and kind in ('image', 'video')) then raise exception 'zone media required'; end if;
      v_zones := v_zones || jsonb_build_object(k, jsonb_build_object('type', 'media', 'media_id', z ->> 'media_id', 'fit', case when z ->> 'fit' = 'cover' then 'cover' else 'contain' end));
    elsif zt = 'board' then
      if coalesce(z ->> 'mode', '') not in ('scheduled', 'actual') or coalesce(z ->> 'layout', '') not in ('columns', 'feed', 'auto') then raise exception 'bad board mode'; end if;
      v_zones := v_zones || jsonb_build_object(k, jsonb_build_object('type', 'board', 'mode', z ->> 'mode', 'layout', z ->> 'layout'));
    elsif zt = 'widgets' then
      v_items := z -> 'items';
      if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 or jsonb_array_length(v_items) > 4 then raise exception 'bad widgets'; end if;
      for it in select jsonb_array_elements_text(v_items) loop
        if it not in ('clock', 'prayer', 'weather', 'next_trip') then raise exception 'bad widgets'; end if;
      end loop;
      v_zones := v_zones || jsonb_build_object(k, jsonb_build_object('type', 'widgets', 'items', v_items));
    else
      raise exception 'bad zone';
    end if;
  end loop;
  v_cfg := jsonb_build_object('layout', v_layout, 'theme', v_theme, 'zones', v_zones) || case when v_city is null then '{}'::jsonb else jsonb_build_object('fallback_city', v_city) end;

  if p_id is null then
    insert into public.signage_media (kind, title, path, mime, size_bytes, duration_sec, config, uploaded_by, uploaded_by_name)
    values ('scene', btrim(p_title), 'scene/' || gen_random_uuid()::text, 'application/x-scene', 1, greatest(5, least(1800, coalesce(p_duration, 30))), v_cfg, a.id, coalesce(a.full_name_ar, ''))
    returning id into v_id;
    perform public.signage_log('scene.save', v_id::text, jsonb_build_object('title', btrim(p_title), 'layout', v_layout, 'created', true));
  else
    select * into old from public.signage_media where id = p_id and kind = 'scene' for update;
    if not found then raise exception 'not found'; end if;
    if r <> 'admin' and old.uploaded_by is distinct from a.id then raise exception 'not allowed'; end if;
    update public.signage_media set title = btrim(p_title), config = v_cfg, duration_sec = greatest(5, least(1800, coalesce(p_duration, 30))) where id = p_id;
    v_id := p_id;
    perform public.signage_log('scene.save', v_id::text, jsonb_build_object('title', btrim(p_title), 'layout', v_layout, 'created', false));
  end if;
  return v_id;
end $$;
revoke all on function public.signage_scene_save(uuid, text, jsonb, int) from public, anon;
grant execute on function public.signage_scene_save(uuid, text, jsonb, int) to authenticated;

-- ═════ 3) دوال الشريط الإخباري ═════
create or replace function public.signage_ticker_save(
  p_id uuid, p_text text, p_level text, p_scope text, p_stations uuid[], p_devices uuid[],
  p_starts timestamptz, p_ends timestamptz, p_days int[], p_from int, p_to int
) returns uuid
language plpgsql security definer set search_path = public as $$
declare a public.users; r text; old public.signage_tickers; v_id uuid; v_status text; n int; v_needs boolean;
begin
  r := public.signage_role();
  if r is null then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  if p_text is null or btrim(p_text) = '' or length(p_text) > 200 then raise exception 'text required'; end if;
  if p_level not in ('normal', 'urgent') then raise exception 'bad level'; end if;
  if p_scope not in ('all', 'stations', 'devices') then raise exception 'bad scope'; end if;
  p_stations := coalesce(p_stations, '{}'); p_devices := coalesce(p_devices, '{}');
  if p_scope = 'stations' then
    if cardinality(p_stations) = 0 then raise exception 'stations required'; end if;
    select count(*) into n from public.stations where id = any(p_stations);
    if n <> cardinality(p_stations) then raise exception 'bad station'; end if;
    p_devices := '{}';
  elsif p_scope = 'devices' then
    if cardinality(p_devices) = 0 then raise exception 'devices required'; end if;
    select count(*) into n from public.signage_devices where id = any(p_devices);
    if n <> cardinality(p_devices) then raise exception 'bad device'; end if;
    p_stations := '{}';
  else
    p_stations := '{}'; p_devices := '{}';
  end if;
  if p_starts is not null and p_ends is not null and p_starts >= p_ends then raise exception 'bad dates'; end if;
  if p_days is not null and exists (select 1 from unnest(p_days) d where d < 0 or d > 6) then raise exception 'bad days'; end if;
  if p_days is not null and cardinality(p_days) = 0 then p_days := null; end if;
  if (p_from is null) <> (p_to is null) then raise exception 'bad time window'; end if;
  if p_from is not null and (p_from not between 0 and 1439 or p_to not between 0 and 1439) then raise exception 'bad time window'; end if;
  -- التسويق: «كل الشاشات» أو «عاجل» يحتاجان موافقة أدمن؛ غير ذلك يُنشر مباشرة
  v_needs := r <> 'admin' and (p_scope = 'all' or p_level = 'urgent');
  v_status := case when v_needs then 'pending' else 'active' end;
  if p_id is null then
    insert into public.signage_tickers (text, level, scope, station_ids, device_ids, starts_at, ends_at, days, from_min, to_min, status, created_by, created_by_name)
    values (btrim(p_text), p_level, p_scope, p_stations, p_devices, p_starts, p_ends, p_days, p_from, p_to, v_status, a.id, coalesce(a.full_name_ar, ''))
    returning id into v_id;
  else
    select * into old from public.signage_tickers where id = p_id for update;
    if not found then raise exception 'not found'; end if;
    if r <> 'admin' and old.created_by is distinct from a.id then raise exception 'not allowed'; end if;
    update public.signage_tickers set text = btrim(p_text), level = p_level, scope = p_scope, station_ids = p_stations, device_ids = p_devices,
      starts_at = p_starts, ends_at = p_ends, days = p_days, from_min = p_from, to_min = p_to, status = v_status,
      reviewed_by_name = null, review_note = null, updated_at = now() where id = p_id;
    v_id := p_id;
  end if;
  perform public.signage_log('ticker.save', v_id::text, jsonb_build_object('title', left(btrim(p_text), 60), 'level', p_level, 'status', v_status));
  if v_status = 'pending' then
    perform public.signage_notify_admins('رسالة شريط بانتظار موافقتك', left(btrim(p_text), 80) || ' من ' || coalesce(a.full_name_ar, ''), a.id);
  end if;
  return v_id;
end $$;

create or replace function public.signage_ticker_review(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a public.users; t public.signage_tickers;
begin
  if public.signage_role() is distinct from 'admin' then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  select * into t from public.signage_tickers where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  if t.status <> 'pending' then raise exception 'bad state'; end if;
  if t.created_by = a.id then raise exception 'creator cannot review'; end if;
  if not p_approve and (p_note is null or btrim(p_note) = '') then raise exception 'note required'; end if;
  update public.signage_tickers set status = case when p_approve then 'active' else 'rejected' end, reviewed_by_name = coalesce(a.full_name_ar, ''),
    review_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now() where id = p_id;
  perform public.signage_log(case when p_approve then 'ticker.approve' else 'ticker.reject' end, p_id::text, jsonb_build_object('title', left(t.text, 60), 'note', p_note));
  perform public.signage_notify_user(t.created_by, case when p_approve then 'تمت الموافقة على رسالة الشريط' else 'رُفضت رسالة الشريط' end,
    left(t.text, 80) || case when p_approve then '' else ' — ' || coalesce(p_note, '') end);
end $$;

create or replace function public.signage_ticker_toggle(p_id uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a public.users; r text; t public.signage_tickers; v_status text;
begin
  r := public.signage_role();
  if r is null then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  select * into t from public.signage_tickers where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  if r <> 'admin' and t.created_by is distinct from a.id then raise exception 'not allowed'; end if;
  if p_on then
    if t.status <> 'paused' then raise exception 'bad state'; end if;
    v_status := case when r <> 'admin' and (t.scope = 'all' or t.level = 'urgent') then 'pending' else 'active' end;
  else
    if t.status <> 'active' then raise exception 'bad state'; end if;
    v_status := 'paused';
  end if;
  update public.signage_tickers set status = v_status, updated_at = now() where id = p_id;
  perform public.signage_log('ticker.toggle', p_id::text, jsonb_build_object('title', left(t.text, 60), 'status', v_status));
  if v_status = 'pending' then perform public.signage_notify_admins('رسالة شريط بانتظار موافقتك', left(t.text, 80), a.id); end if;
end $$;

create or replace function public.signage_ticker_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.users; r text; t public.signage_tickers;
begin
  r := public.signage_role();
  if r is null then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  select * into t from public.signage_tickers where id = p_id;
  if not found then raise exception 'not found'; end if;
  if r <> 'admin' and t.created_by is distinct from a.id then raise exception 'not allowed'; end if;
  delete from public.signage_tickers where id = p_id;
  perform public.signage_log('ticker.delete', p_id::text, jsonb_build_object('title', left(t.text, 60)));
end $$;

revoke all on function public.signage_ticker_save(uuid, text, text, text, uuid[], uuid[], timestamptz, timestamptz, int[], int, int), public.signage_ticker_review(uuid, boolean, text),
  public.signage_ticker_toggle(uuid, boolean), public.signage_ticker_delete(uuid) from public, anon;
grant execute on function public.signage_ticker_save(uuid, text, text, text, uuid[], uuid[], timestamptz, timestamptz, int[], int, int), public.signage_ticker_review(uuid, boolean, text),
  public.signage_ticker_toggle(uuid, boolean), public.signage_ticker_delete(uuid) to authenticated;

-- حذف محتوى مستخدم داخل مشهد مرفوض أيضاً (كما هو مرفوض لو استخدمته حملة)
create or replace function public.signage_media_delete(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare m public.signage_media; a public.users;
begin
  if public.signage_role() is null then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  select * into m from public.signage_media where id = p_id;
  if not found then raise exception 'not found'; end if;
  if public.signage_role() <> 'admin' and m.uploaded_by is distinct from a.id then raise exception 'not allowed'; end if;
  if exists (select 1 from public.signage_campaigns where media_id = p_id)
     or exists (select 1 from public.signage_media s where s.kind = 'scene' and jsonb_path_exists(s.config, '$.zones.*.media_id ? (@ == $id)', jsonb_build_object('id', p_id::text))) then
    raise exception 'media in use';
  end if;
  delete from public.signage_media where id = p_id;
  perform public.signage_log('media.delete', p_id::text, jsonb_build_object('title', m.title));
  return m.path;
end $$;

-- ═════ 4) القائمة: المشاهد ووسائطها، الشريط الإخباري، وإحداثيات محطة الشاشة ═════
create or replace function public.signage_manifest(p_secret text, p_version text default null, p_playing text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d public.signage_devices; e public.signage_emergency; c0 public.signage_control; v_now timestamptz := now(); lt timestamp; v_dow int; v_min int;
  v_items jsonb; v_em jsonb := null; v_halt jsonb := null; st text; v_h text; v_via_prev boolean; v_new text := null;
  v_hdr jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip text; v_ua text; v_uas text; v_susp text := null;
  v_tick jsonb := '[]'::jsonb; v_lat double precision; v_lng double precision;
begin
  d := public.signage_device_of(p_secret);
  if d.id is null then raise exception 'unauthorized'; end if;
  v_h := public.signage_hash(p_secret);
  v_via_prev := d.secret_hash <> v_h;

  -- عنوان الشبكة والمتصفح: تبدّل متكرر بين عنوانين خلال 10 دقائق أو تغيّر نوع المتصفح = اشتباه استنساخ المفتاح
  v_ip := nullif(left(coalesce(v_hdr ->> 'cf-connecting-ip', v_hdr ->> 'x-real-ip', split_part(coalesce(v_hdr ->> 'x-forwarded-for', ''), ',', 1)), 64), '');
  v_ua := left(coalesce(v_hdr ->> 'user-agent', ''), 300);
  v_uas := md5(regexp_replace(v_ua, '[0-9._]+', '', 'g'));
  if v_ip is not null and d.last_ip is not null and v_ip <> d.last_ip and d.prev_ip = v_ip and d.prev_ip_at > v_now - interval '10 minutes' then
    v_susp := 'تبدّل متكرر بين عنوانين للشبكة (احتمال نسخ المفتاح على جهاز آخر)';
  elsif d.ua_sig is not null and v_ua <> '' and d.ua_sig <> v_uas then
    v_susp := 'تغيّر نوع المتصفح/الجهاز المرتبط بالمفتاح';
  end if;
  if v_susp is not null and not d.suspect then
    update public.signage_devices set suspect = true, suspect_reason = v_susp, suspect_at = v_now where id = d.id;
    insert into public.signage_audit (actor_name, action, subject, detail) values ('النظام', 'device.suspect', d.id::text, jsonb_build_object('name', d.name, 'reason', v_susp, 'ip', v_ip));
    perform public.signage_notify_admins('شاشة مشتبه بها: ' || d.name, v_susp, null);
  end if;

  -- تدوير المفتاح: كل 3 أيام، أو بأمر الأدمن، أو إن استُخدم المفتاح السابق (لم يصل الجهاز الجديد)
  if d.force_rotate or v_via_prev or d.secret_rotated_at < v_now - interval '3 days' then
    v_new := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    update public.signage_devices set
      prev_secret_hash = case when v_via_prev then d.prev_secret_hash else d.secret_hash end,
      prev_valid_until = case when v_via_prev then d.prev_valid_until else v_now + interval '15 minutes' end,
      secret_hash = public.signage_hash(v_new), secret_rotated_at = v_now, force_rotate = false where id = d.id;
  end if;

  update public.signage_devices set last_seen_at = v_now, app_version = coalesce(left(p_version, 40), app_version), now_playing = coalesce(left(p_playing, 120), now_playing),
    ua_sig = coalesce(d.ua_sig, case when v_ua <> '' then v_uas end),
    prev_ip = case when v_ip is not null and d.last_ip is not null and v_ip <> d.last_ip then d.last_ip else d.prev_ip end,
    prev_ip_at = case when v_ip is not null and d.last_ip is not null and v_ip <> d.last_ip then d.last_ip_at else d.prev_ip_at end,
    last_ip = coalesce(v_ip, d.last_ip), last_ip_at = case when v_ip is not null then v_now else d.last_ip_at end
  where id = d.id;

  if random() < 0.01 then
    delete from public.signage_playlog where played_at < now() - interval '90 days';
    delete from public.signage_audit where at < now() - interval '2 years';
  end if;

  select * into c0 from public.signage_control where id = 1;
  if c0.halted or d.paused then
    v_halt := jsonb_build_object('reason', case when c0.halted then c0.halt_reason else null end);
    v_items := '[]'::jsonb;
  else
    lt := v_now at time zone 'Asia/Riyadh';
    v_dow := extract(dow from lt)::int;
    v_min := extract(hour from lt)::int * 60 + extract(minute from lt)::int;
    select * into e from public.signage_emergency where id = 1;
    if e.active and (e.ends_at is null or e.ends_at > v_now) then v_em := jsonb_build_object('message', e.message); end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'campaign_id', cp.id, 'media_id', m.id, 'kind', m.kind, 'path', m.path, 'mime', m.mime, 'size', m.size_bytes, 'config', m.config,
        'refs', case when m.kind = 'scene' then (select coalesce(jsonb_object_agg(rm.id, jsonb_build_object('kind', rm.kind, 'path', rm.path, 'duration', rm.duration_sec)), '{}'::jsonb)
                   from public.signage_media rm where rm.id::text in (select jsonb_path_query(m.config, '$.zones.*.media_id') #>> '{}')) end,
        'duration', case when m.kind = 'video' then m.duration_sec else coalesce(cp.duration_sec, m.duration_sec) end, 'title', cp.title
      ) order by cp.sort, cp.created_at), '[]'::jsonb) into v_items
    from public.signage_campaigns cp join public.signage_media m on m.id = cp.media_id
    where cp.status = 'approved'
      and (cp.starts_at is null or cp.starts_at <= v_now) and (cp.ends_at is null or cp.ends_at > v_now)
      and (cp.days is null or v_dow = any(cp.days))
      and (cp.from_min is null or (case when cp.from_min <= cp.to_min then v_min >= cp.from_min and v_min < cp.to_min else v_min >= cp.from_min or v_min < cp.to_min end))
      and (cp.scope = 'all' or (cp.scope = 'stations' and d.station_id = any(cp.station_ids)) or (cp.scope = 'devices' and d.id = any(cp.device_ids)));
    -- رسائل الشريط الإخباري السارية لهذه الشاشة الآن (العاجلة أولاً)
    select coalesce(jsonb_agg(jsonb_build_object('id', tk.id, 'text', tk.text, 'level', tk.level) order by (tk.level = 'urgent') desc, tk.created_at), '[]'::jsonb) into v_tick
    from public.signage_tickers tk
    where tk.status = 'active'
      and (tk.starts_at is null or tk.starts_at <= v_now) and (tk.ends_at is null or tk.ends_at > v_now)
      and (tk.days is null or v_dow = any(tk.days))
      and (tk.from_min is null or (case when tk.from_min <= tk.to_min then v_min >= tk.from_min and v_min < tk.to_min else v_min >= tk.from_min or v_min < tk.to_min end))
      and (tk.scope = 'all' or (tk.scope = 'stations' and d.station_id = any(tk.station_ids)) or (tk.scope = 'devices' and d.id = any(tk.device_ids)));
  end if;
  select coalesce(nullif(name_ar, ''), name_en), lat, lng into st, v_lat, v_lng from public.stations where id = d.station_id;
  return jsonb_build_object('device', jsonb_build_object('id', d.id, 'name', d.name, 'orientation', d.orientation, 'station', st, 'lat', v_lat, 'lng', v_lng),
    'now', v_now, 'emergency', v_em, 'halted', v_halt, 'items', v_items, 'tickers', v_tick, 'ttl', 43200,
    'cmd', jsonb_build_object('reload', d.reload_nonce, 'snap', d.snap_requested_at is not null), 'new_secret', v_new);
end $$;

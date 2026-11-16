-- شاشات المحطات (Signage): إدارة محتوى الشاشات (صور/فيديو) وجدولته واستهدافه، مع ربط آمن للأجهزة وسجل تدقيق.
-- التصميم الأمني:
--   • الشاشة لا تملك حساب موظف: مفتاح جهاز عشوائي (256 بت) يُخزَّن مجزَّأً (SHA-256) فقط، ولا يقرأ إلا قائمته عبر دالة.
--   • رمز الربط 8 خانات يُستخدم مرة واحدة وينتهي بعد 10 دقائق، ولا يُنشئ الجهاز إلا الأدمن.
--   • كل الكتابة عبر دوال تتحقق من الدور؛ الجداول للقراءة فقط (والمفتاح المجزَّأ محجوب بصلاحيات الأعمدة).
--   • حملة «كل الشاشات» من التسويق لا تُنشر إلا بموافقة أدمن آخر.
--   • كل عملية حسّاسة تُسجَّل في signage_audit (للأدمن فقط، ولا يُعدَّل ولا يُحذف).
-- شغّل كل كتلة (مفصولة بسطر ═══) بشكل منفصل في Supabase SQL Editor، بالترتيب.

-- ═════ 1) الجداول والصلاحيات ═════
create table if not exists public.signage_devices (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  station_id   uuid references public.stations(id) on delete set null,
  orientation  text not null default 'landscape' check (orientation in ('landscape', 'portrait')),
  secret_hash  text not null unique,
  status       text not null default 'active' check (status in ('active', 'revoked')),
  paired_by    uuid references public.users(id) on delete set null,
  paired_at    timestamptz not null default now(),
  last_seen_at timestamptz,
  app_version  text,
  now_playing  text,
  revoked_at   timestamptz,
  revoked_by   uuid references public.users(id) on delete set null
);

create table if not exists public.signage_pairing (
  code        text primary key,
  secret_hash text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '10 minutes'
);

create table if not exists public.signage_media (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('image', 'video')),
  title            text not null,
  path             text not null unique,
  mime             text not null,
  size_bytes       bigint not null check (size_bytes > 0),
  duration_sec     int not null default 15 check (duration_sec between 1 and 1800),
  uploaded_by      uuid references public.users(id) on delete set null,
  uploaded_by_name text not null default '',
  created_at       timestamptz not null default now()
);

create table if not exists public.signage_campaigns (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  media_id          uuid not null references public.signage_media(id),
  scope             text not null default 'stations' check (scope in ('all', 'stations', 'devices')),
  station_ids       uuid[] not null default '{}',
  device_ids        uuid[] not null default '{}',
  starts_at         timestamptz,
  ends_at           timestamptz,
  days              int[],
  from_min          int check (from_min between 0 and 1439),
  to_min            int check (to_min between 0 and 1439),
  duration_sec      int check (duration_sec between 1 and 1800),
  sort              int not null default 100,
  status            text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected', 'paused')),
  created_by        uuid references public.users(id) on delete set null,
  created_by_name   text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  reviewed_by_name  text,
  reviewed_at       timestamptz,
  review_note       text,
  check ((from_min is null) = (to_min is null)),
  check (starts_at is null or ends_at is null or starts_at < ends_at)
);

create table if not exists public.signage_emergency (
  id          int primary key default 1 check (id = 1),
  active      boolean not null default false,
  message     text not null default '',
  ends_at     timestamptz,
  set_by_name text,
  set_at      timestamptz
);
insert into public.signage_emergency (id) values (1) on conflict do nothing;

create table if not exists public.signage_audit (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  actor_id   uuid,
  actor_name text not null default '',
  action     text not null,
  subject    text,
  detail     jsonb not null default '{}'::jsonb
);

create table if not exists public.signage_playlog (
  id          bigserial primary key,
  device_id   uuid not null references public.signage_devices(id) on delete cascade,
  campaign_id uuid,
  media_id    uuid,
  played_at   timestamptz not null default now(),
  seconds     int not null default 0
);

create index if not exists idx_signage_camp_status on public.signage_campaigns(status);
create index if not exists idx_signage_audit_at    on public.signage_audit(at desc);
create index if not exists idx_signage_playlog_dev on public.signage_playlog(device_id, played_at desc);
create index if not exists idx_signage_playlog_at  on public.signage_playlog(played_at);

alter table public.signage_devices   enable row level security;
alter table public.signage_pairing   enable row level security;
alter table public.signage_media     enable row level security;
alter table public.signage_campaigns enable row level security;
alter table public.signage_emergency enable row level security;
alter table public.signage_audit     enable row level security;
alter table public.signage_playlog   enable row level security;

-- ═════ 2) دوال مساعدة داخلية ═════
-- دور الحساب الحالي بالشاشات: admin | marketing | null (التسويق = قسم «signage» مُسنَد صراحةً بإدارة الموظفين)
create or replace function public.signage_role() returns text
language sql security definer stable set search_path = public as $$
  select case
    when u.role::text in ('general_admin', 'stations_executive_director', 'assistant_stations_executive_director') and not coalesce(public.is_restricted(), false) then 'admin'
    when u.allowed_modules is not null and 'signage' = any(u.allowed_modules) then 'marketing'
  end
  from public.users u where u.auth_id = auth.uid() and u.is_active limit 1
$$;

create or replace function public.signage_actor() returns public.users
language sql security definer stable set search_path = public as $$
  select * from public.users where auth_id = auth.uid() and is_active limit 1
$$;

create or replace function public.signage_hash(p text) returns text
language sql immutable as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;

create or replace function public.signage_log(p_action text, p_subject text, p_detail jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a public.users;
begin
  select * into a from public.users where auth_id = auth.uid() limit 1;
  insert into public.signage_audit (actor_id, actor_name, action, subject, detail)
  values (a.id, coalesce(a.full_name_ar, ''), p_action, p_subject, coalesce(p_detail, '{}'::jsonb));
end $$;

-- إشعار لكل الأدمن النشطين (فشل الإشعار لا يوقف العملية)
create or replace function public.signage_notify_admins(p_title text, p_body text, p_exclude uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, title, body, type, ref_type, ref_id)
  select u.id, p_title, p_body, 'signage', 'signage', null
  from public.users u
  where u.is_active and u.role::text in ('general_admin', 'stations_executive_director', 'assistant_stations_executive_director')
    and not coalesce((select (t.permissions->>'restricted_mode')::boolean from public.custom_titles t where t.id = u.custom_title_id), false)
    and (p_exclude is null or u.id <> p_exclude);
exception when others then
  raise warning 'signage_notify_admins failed: %', sqlerrm;
end $$;

create or replace function public.signage_notify_user(p_user uuid, p_title text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, title, body, type, ref_type, ref_id) values (p_user, p_title, p_body, 'signage', 'signage', null);
exception when others then
  raise warning 'signage_notify_user failed: %', sqlerrm;
end $$;

-- الجهاز المصادَق (نشط فقط) من مفتاحه
create or replace function public.signage_device_of(p_secret text) returns public.signage_devices
language sql security definer stable set search_path = public as $$
  select * from public.signage_devices
  where secret_hash = public.signage_hash(coalesce(p_secret, '')) and status = 'active' limit 1
$$;

revoke all on function public.signage_actor(), public.signage_hash(text), public.signage_log(text, text, jsonb),
  public.signage_notify_admins(text, text, uuid), public.signage_notify_user(uuid, text, text),
  public.signage_device_of(text) from public, anon, authenticated;
revoke all on function public.signage_role() from public, anon;
grant execute on function public.signage_role() to authenticated;

-- منح قسم «signage» لحساب لا يتم إلا من أدمن (يمنع مشرف محطة من رفع صلاحيات موظف عبر صفحة الموظفين).
-- التعديل من SQL Editor أو بمفتاح الخدمة (auth.uid() فارغ) مسموح.
create or replace function public.signage_guard_modules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.allowed_modules is not null and 'signage' = any(new.allowed_modules)
     and (tg_op = 'INSERT' or old.allowed_modules is null or not ('signage' = any(old.allowed_modules)))
     and auth.uid() is not null and public.signage_role() is distinct from 'admin' then
    raise exception 'signage access can only be granted by admins';
  end if;
  return new;
end $$;
revoke all on function public.signage_guard_modules() from public, anon, authenticated;
drop trigger if exists trg_signage_guard on public.users;
create trigger trg_signage_guard before insert or update of allowed_modules on public.users for each row execute function public.signage_guard_modules();

-- ═════ 3) سياسات القراءة (الكتابة عبر الدوال فقط) ═════
drop policy if exists sgn_dev_sel on public.signage_devices;
create policy sgn_dev_sel on public.signage_devices for select to authenticated using (public.signage_role() is not null);
drop policy if exists sgn_med_sel on public.signage_media;
create policy sgn_med_sel on public.signage_media for select to authenticated using (public.signage_role() is not null);
drop policy if exists sgn_cmp_sel on public.signage_campaigns;
create policy sgn_cmp_sel on public.signage_campaigns for select to authenticated using (public.signage_role() is not null);
drop policy if exists sgn_emg_sel on public.signage_emergency;
create policy sgn_emg_sel on public.signage_emergency for select to authenticated using (public.signage_role() is not null);
drop policy if exists sgn_aud_sel on public.signage_audit;
create policy sgn_aud_sel on public.signage_audit for select to authenticated using (public.signage_role() = 'admin');
drop policy if exists sgn_log_sel on public.signage_playlog;
create policy sgn_log_sel on public.signage_playlog for select to authenticated using (public.signage_role() is not null);

revoke all on public.signage_devices, public.signage_pairing, public.signage_media, public.signage_campaigns,
  public.signage_emergency, public.signage_audit, public.signage_playlog from public, anon, authenticated;
-- المفتاح المجزَّأ لا يُقرأ أبداً من التطبيق
grant select (id, name, station_id, orientation, status, paired_by, paired_at, last_seen_at, app_version, now_playing, revoked_at, revoked_by)
  on public.signage_devices to authenticated;
grant select on public.signage_media, public.signage_campaigns, public.signage_emergency, public.signage_audit, public.signage_playlog to authenticated;
revoke all on sequence public.signage_audit_id_seq, public.signage_playlog_id_seq from public, anon, authenticated;

-- ═════ 4) ربط الأجهزة (دوال الشاشة: بدون حساب، بمفتاح الجهاز) ═════
-- الشاشة تولّد مفتاحاً عشوائياً وتحفظه محلياً، وتطلب رمز ربط يعرضه الأدمن بلوحة التحكم
create or replace function public.signage_pair_start(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare h text; v_code text; i int; tries int := 0;
  alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if p_secret is null or length(p_secret) < 40 or length(p_secret) > 200 then raise exception 'bad secret'; end if;
  h := public.signage_hash(p_secret);
  if exists (select 1 from public.signage_devices where secret_hash = h and status = 'active') then
    return jsonb_build_object('state', 'paired');
  end if;
  if exists (select 1 from public.signage_devices where secret_hash = h and status = 'revoked') then
    return jsonb_build_object('state', 'revoked');
  end if;
  delete from public.signage_pairing where expires_at < now() or secret_hash = h;
  if (select count(*) from public.signage_pairing) > 2000 then raise exception 'busy'; end if;
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(alpha, 1 + (get_byte(uuid_send(gen_random_uuid()), 0) % length(alpha)), 1);
    end loop;
    begin
      insert into public.signage_pairing (code, secret_hash) values (v_code, h);
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 8 then raise exception 'busy'; end if;
    end;
  end loop;
  return jsonb_build_object('state', 'pending', 'code', v_code, 'expires_in', 600);
end $$;

create or replace function public.signage_pair_status(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare h text; d public.signage_devices;
begin
  if p_secret is null or length(p_secret) < 40 then return jsonb_build_object('state', 'unknown'); end if;
  h := public.signage_hash(p_secret);
  select * into d from public.signage_devices where secret_hash = h;
  if found then return jsonb_build_object('state', case when d.status = 'active' then 'paired' else 'revoked' end); end if;
  if exists (select 1 from public.signage_pairing where secret_hash = h and expires_at > now()) then
    return jsonb_build_object('state', 'pending');
  end if;
  return jsonb_build_object('state', 'expired');
end $$;

-- الأدمن يربط الشاشة بإدخال الرمز
create or replace function public.signage_pair_confirm(p_code text, p_name text, p_station uuid, p_orientation text default 'landscape') returns uuid
language plpgsql security definer set search_path = public as $$
declare a public.users; pr public.signage_pairing; v_id uuid;
begin
  if public.signage_role() is distinct from 'admin' then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  if p_name is null or btrim(p_name) = '' or length(p_name) > 80 then raise exception 'name required'; end if;
  if p_orientation not in ('landscape', 'portrait') then raise exception 'bad orientation'; end if;
  if p_station is not null and not exists (select 1 from public.stations where id = p_station) then raise exception 'bad station'; end if;
  if (select count(*) from public.signage_devices) >= 5000 then raise exception 'device limit'; end if;
  select * into pr from public.signage_pairing where code = upper(btrim(coalesce(p_code, ''))) and expires_at > now() for update;
  if not found then raise exception 'invalid or expired code'; end if;
  insert into public.signage_devices (name, station_id, orientation, secret_hash, paired_by)
  values (btrim(p_name), p_station, p_orientation, pr.secret_hash, a.id) returning id into v_id;
  delete from public.signage_pairing where code = pr.code;
  perform public.signage_log('device.pair', v_id::text, jsonb_build_object('name', btrim(p_name), 'station_id', p_station));
  return v_id;
end $$;

create or replace function public.signage_device_update(p_id uuid, p_name text, p_station uuid, p_orientation text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.signage_role() is distinct from 'admin' then raise exception 'not allowed'; end if;
  if p_name is null or btrim(p_name) = '' or length(p_name) > 80 then raise exception 'name required'; end if;
  if p_orientation not in ('landscape', 'portrait') then raise exception 'bad orientation'; end if;
  if p_station is not null and not exists (select 1 from public.stations where id = p_station) then raise exception 'bad station'; end if;
  update public.signage_devices set name = btrim(p_name), station_id = p_station, orientation = p_orientation where id = p_id;
  if not found then raise exception 'not found'; end if;
  perform public.signage_log('device.update', p_id::text, jsonb_build_object('name', btrim(p_name), 'station_id', p_station));
end $$;

-- إيقاف جهاز فوراً (سرقة/اختراق): مفتاحه يتوقف عن العمل
create or replace function public.signage_device_revoke(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.users;
begin
  if public.signage_role() is distinct from 'admin' then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  update public.signage_devices set status = 'revoked', revoked_at = now(), revoked_by = a.id where id = p_id and status = 'active';
  if not found then raise exception 'not found'; end if;
  perform public.signage_log('device.revoke', p_id::text, '{}'::jsonb);
end $$;

create or replace function public.signage_device_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  if public.signage_role() is distinct from 'admin' then raise exception 'not allowed'; end if;
  select name into n from public.signage_devices where id = p_id;
  if not found then raise exception 'not found'; end if;
  delete from public.signage_devices where id = p_id;
  perform public.signage_log('device.delete', p_id::text, jsonb_build_object('name', n));
end $$;

-- ═════ 5) المحتوى (المكتبة) ═════
-- الرفع نفسه للتخزين (bucket «signage»)؛ هذه الدالة تسجّل الملف بعد التحقق من المسار والنوع والحجم
create or replace function public.signage_media_add(p_kind text, p_title text, p_path text, p_mime text, p_size bigint, p_duration int) returns uuid
language plpgsql security definer set search_path = public as $$
declare a public.users; v_id uuid; v_ext text;
begin
  if public.signage_role() is null then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  if p_kind not in ('image', 'video') then raise exception 'bad kind'; end if;
  if p_title is null or btrim(p_title) = '' or length(p_title) > 120 then raise exception 'title required'; end if;
  if p_path is null or p_path !~ ('^media/' || auth.uid()::text || '/[0-9a-f-]{36}\.(mp4|webm|jpg|jpeg|png|webp)$') then raise exception 'bad path'; end if;
  v_ext := lower(substring(p_path from '\.([a-z0-9]+)$'));
  if p_kind = 'video' and (v_ext not in ('mp4', 'webm') or p_mime not in ('video/mp4', 'video/webm') or p_size > 209715200) then raise exception 'bad video'; end if;
  if p_kind = 'image' and (v_ext not in ('jpg', 'jpeg', 'png', 'webp') or p_mime not in ('image/jpeg', 'image/png', 'image/webp') or p_size > 15728640) then raise exception 'bad image'; end if;
  insert into public.signage_media (kind, title, path, mime, size_bytes, duration_sec, uploaded_by, uploaded_by_name)
  values (p_kind, btrim(p_title), p_path, p_mime, p_size, greatest(1, least(1800, coalesce(p_duration, 15))), a.id, coalesce(a.full_name_ar, ''))
  returning id into v_id;
  perform public.signage_log('media.add', v_id::text, jsonb_build_object('title', btrim(p_title), 'kind', p_kind, 'size', p_size));
  return v_id;
end $$;

-- يرجع مسار الملف ليحذفه التطبيق من التخزين؛ مرفوض إن كانت حملة تستخدمه
create or replace function public.signage_media_delete(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare m public.signage_media; a public.users;
begin
  if public.signage_role() is null then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  select * into m from public.signage_media where id = p_id;
  if not found then raise exception 'not found'; end if;
  if public.signage_role() <> 'admin' and m.uploaded_by is distinct from a.id then raise exception 'not allowed'; end if;
  if exists (select 1 from public.signage_campaigns where media_id = p_id) then raise exception 'media in use'; end if;
  delete from public.signage_media where id = p_id;
  perform public.signage_log('media.delete', p_id::text, jsonb_build_object('title', m.title));
  return m.path;
end $$;

-- ═════ 6) الحملات (جدولة + استهداف + موافقة) ═════
create or replace function public.signage_campaign_save(
  p_id uuid, p_title text, p_media uuid, p_scope text, p_stations uuid[], p_devices uuid[],
  p_starts timestamptz, p_ends timestamptz, p_days int[], p_from int, p_to int, p_duration int, p_sort int
) returns uuid
language plpgsql security definer set search_path = public as $$
declare a public.users; r text; old public.signage_campaigns; v_id uuid; v_status text; n int;
begin
  r := public.signage_role();
  if r is null then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  if p_title is null or btrim(p_title) = '' or length(p_title) > 120 then raise exception 'title required'; end if;
  if not exists (select 1 from public.signage_media where id = p_media) then raise exception 'media required'; end if;
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
  if p_duration is not null and p_duration not between 1 and 1800 then raise exception 'bad duration'; end if;

  if p_id is null then
    insert into public.signage_campaigns (title, media_id, scope, station_ids, device_ids, starts_at, ends_at, days, from_min, to_min, duration_sec, sort, created_by, created_by_name)
    values (btrim(p_title), p_media, p_scope, p_stations, p_devices, p_starts, p_ends, p_days, p_from, p_to, p_duration, coalesce(p_sort, 100), a.id, coalesce(a.full_name_ar, ''))
    returning id into v_id;
    perform public.signage_log('campaign.create', v_id::text, jsonb_build_object('title', btrim(p_title), 'scope', p_scope));
  else
    select * into old from public.signage_campaigns where id = p_id for update;
    if not found then raise exception 'not found'; end if;
    if r <> 'admin' and old.created_by is distinct from a.id then raise exception 'not allowed'; end if;
    -- أي تعديل من غير الأدمن يُسقط الموافقة (لا يُبدَّل محتوى معتمد خلسةً)
    v_status := case when r = 'admin' then old.status else case when old.status = 'approved' then 'draft' else old.status end end;
    update public.signage_campaigns set title = btrim(p_title), media_id = p_media, scope = p_scope, station_ids = p_stations, device_ids = p_devices,
      starts_at = p_starts, ends_at = p_ends, days = p_days, from_min = p_from, to_min = p_to, duration_sec = p_duration, sort = coalesce(p_sort, 100),
      status = v_status, updated_at = now() where id = p_id;
    v_id := p_id;
    perform public.signage_log('campaign.update', v_id::text, jsonb_build_object('title', btrim(p_title), 'scope', p_scope, 'status', v_status));
  end if;
  return v_id;
end $$;

-- تقديم/نشر: أدمن → معتمدة فوراً. تسويق → «كل الشاشات» تنتظر موافقة أدمن، وغيرها تُنشر مباشرة
create or replace function public.signage_campaign_submit(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare a public.users; r text; c public.signage_campaigns; v_status text;
begin
  r := public.signage_role();
  if r is null then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  select * into c from public.signage_campaigns where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  if r <> 'admin' and c.created_by is distinct from a.id then raise exception 'not allowed'; end if;
  if c.status not in ('draft', 'rejected', 'paused') then raise exception 'bad state'; end if;
  v_status := case when r = 'admin' or c.scope <> 'all' then 'approved' else 'pending' end;
  update public.signage_campaigns set status = v_status, updated_at = now(),
    reviewed_by_name = case when v_status = 'approved' then coalesce(a.full_name_ar, '') else null end,
    reviewed_at = case when v_status = 'approved' then now() else null end, review_note = null where id = p_id;
  perform public.signage_log('campaign.submit', p_id::text, jsonb_build_object('title', c.title, 'status', v_status));
  if v_status = 'pending' then
    perform public.signage_notify_admins('حملة شاشات بانتظار موافقتك', c.title || ' (كل الشاشات) من ' || coalesce(a.full_name_ar, ''), a.id);
  end if;
  return v_status;
end $$;

create or replace function public.signage_campaign_review(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a public.users; c public.signage_campaigns;
begin
  if public.signage_role() is distinct from 'admin' then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  select * into c from public.signage_campaigns where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  if c.status <> 'pending' then raise exception 'bad state'; end if;
  if c.created_by = a.id then raise exception 'creator cannot review'; end if;
  if not p_approve and (p_note is null or btrim(p_note) = '') then raise exception 'note required'; end if;
  update public.signage_campaigns set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by_name = coalesce(a.full_name_ar, ''), reviewed_at = now(), review_note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now() where id = p_id;
  perform public.signage_log(case when p_approve then 'campaign.approve' else 'campaign.reject' end, p_id::text, jsonb_build_object('title', c.title, 'note', p_note));
  perform public.signage_notify_user(c.created_by, case when p_approve then 'تمت الموافقة على حملتك' else 'رُفضت حملتك' end,
    c.title || case when p_approve then '' else ' — ' || coalesce(p_note, '') end);
end $$;

create or replace function public.signage_campaign_pause(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.users; r text; c public.signage_campaigns;
begin
  r := public.signage_role();
  if r is null then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  select * into c from public.signage_campaigns where id = p_id for update;
  if not found then raise exception 'not found'; end if;
  if r <> 'admin' and c.created_by is distinct from a.id then raise exception 'not allowed'; end if;
  if c.status <> 'approved' then raise exception 'bad state'; end if;
  update public.signage_campaigns set status = 'paused', updated_at = now() where id = p_id;
  perform public.signage_log('campaign.pause', p_id::text, jsonb_build_object('title', c.title));
end $$;

create or replace function public.signage_campaign_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.users; r text; c public.signage_campaigns;
begin
  r := public.signage_role();
  if r is null then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  select * into c from public.signage_campaigns where id = p_id;
  if not found then raise exception 'not found'; end if;
  if r <> 'admin' and c.created_by is distinct from a.id then raise exception 'not allowed'; end if;
  delete from public.signage_campaigns where id = p_id;
  perform public.signage_log('campaign.delete', p_id::text, jsonb_build_object('title', c.title, 'status', c.status));
end $$;

-- ═════ 7) الطوارئ (أدمن فقط): رسالة تقطع المحتوى على كل الشاشات فوراً ═════
create or replace function public.signage_emergency_set(p_active boolean, p_message text, p_minutes int default null) returns void
language plpgsql security definer set search_path = public as $$
declare a public.users;
begin
  if public.signage_role() is distinct from 'admin' then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  if p_active and (p_message is null or btrim(p_message) = '' or length(p_message) > 300) then raise exception 'message required'; end if;
  if p_minutes is not null and p_minutes not between 1 and 1440 then raise exception 'bad minutes'; end if;
  update public.signage_emergency set active = p_active, message = case when p_active then btrim(p_message) else message end,
    ends_at = case when p_active and p_minutes is not null then now() + make_interval(mins => p_minutes) else null end,
    set_by_name = coalesce(a.full_name_ar, ''), set_at = now() where id = 1;
  perform public.signage_log(case when p_active then 'emergency.on' else 'emergency.off' end, '1', jsonb_build_object('message', p_message, 'minutes', p_minutes));
end $$;

-- ═════ 8) دوال الشاشة: القائمة + التقرير ═════
-- القائمة الحالية للجهاز (تُجدَّد كل دقيقة تقريباً) — تُرجع فقط ما يُعرض الآن حسب الجدولة والاستهداف
create or replace function public.signage_manifest(p_secret text, p_version text default null, p_playing text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.signage_devices; e public.signage_emergency; v_now timestamptz := now(); lt timestamp; v_dow int; v_min int; v_items jsonb; v_em jsonb := null; st text;
begin
  d := public.signage_device_of(p_secret);
  if d.id is null then raise exception 'unauthorized'; end if;
  update public.signage_devices set last_seen_at = v_now, app_version = coalesce(left(p_version, 40), app_version), now_playing = coalesce(left(p_playing, 120), now_playing) where id = d.id;
  if random() < 0.01 then
    delete from public.signage_playlog where played_at < now() - interval '90 days';
    delete from public.signage_audit where at < now() - interval '2 years';
  end if;
  lt := v_now at time zone 'Asia/Riyadh';
  v_dow := extract(dow from lt)::int;
  v_min := extract(hour from lt)::int * 60 + extract(minute from lt)::int;
  select * into e from public.signage_emergency where id = 1;
  if e.active and (e.ends_at is null or e.ends_at > v_now) then v_em := jsonb_build_object('message', e.message); end if;
  select coalesce(nullif(name_ar, ''), name_en) into st from public.stations where id = d.station_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'campaign_id', c.id, 'media_id', m.id, 'kind', m.kind, 'path', m.path, 'mime', m.mime, 'size', m.size_bytes,
      'duration', case when m.kind = 'video' then m.duration_sec else coalesce(c.duration_sec, m.duration_sec) end, 'title', c.title
    ) order by c.sort, c.created_at), '[]'::jsonb) into v_items
  from public.signage_campaigns c join public.signage_media m on m.id = c.media_id
  where c.status = 'approved'
    and (c.starts_at is null or c.starts_at <= v_now) and (c.ends_at is null or c.ends_at > v_now)
    and (c.days is null or v_dow = any(c.days))
    and (c.from_min is null or (case when c.from_min <= c.to_min then v_min >= c.from_min and v_min < c.to_min else v_min >= c.from_min or v_min < c.to_min end))
    and (c.scope = 'all' or (c.scope = 'stations' and d.station_id = any(c.station_ids)) or (c.scope = 'devices' and d.id = any(c.device_ids)));
  return jsonb_build_object('device', jsonb_build_object('id', d.id, 'name', d.name, 'orientation', d.orientation, 'station', st),
    'now', v_now, 'emergency', v_em, 'items', v_items, 'ttl', 43200);
end $$;

-- إثبات التشغيل: ما عُرض فعلاً (حتى 100 سجل بالطلب)
create or replace function public.signage_report(p_secret text, p_plays jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare d public.signage_devices;
begin
  d := public.signage_device_of(p_secret);
  if d.id is null then raise exception 'unauthorized'; end if;
  if p_plays is null or jsonb_typeof(p_plays) <> 'array' then return; end if;
  insert into public.signage_playlog (device_id, campaign_id, media_id, played_at, seconds)
  select d.id, (x->>'c')::uuid, (x->>'m')::uuid, coalesce((x->>'t')::timestamptz, now()), greatest(0, least(3600, coalesce((x->>'s')::int, 0)))
  from (select value as x from jsonb_array_elements(p_plays) limit 100) q;
end $$;

revoke all on function public.signage_pair_start(text), public.signage_pair_status(text), public.signage_manifest(text, text, text), public.signage_report(text, jsonb) from public;
grant execute on function public.signage_pair_start(text), public.signage_pair_status(text), public.signage_manifest(text, text, text), public.signage_report(text, jsonb) to anon, authenticated;
revoke all on function
  public.signage_pair_confirm(text, text, uuid, text), public.signage_device_update(uuid, text, uuid, text), public.signage_device_revoke(uuid), public.signage_device_delete(uuid),
  public.signage_media_add(text, text, text, text, bigint, int), public.signage_media_delete(uuid),
  public.signage_campaign_save(uuid, text, uuid, text, uuid[], uuid[], timestamptz, timestamptz, int[], int, int, int, int),
  public.signage_campaign_submit(uuid), public.signage_campaign_review(uuid, boolean, text), public.signage_campaign_pause(uuid), public.signage_campaign_delete(uuid),
  public.signage_emergency_set(boolean, text, int) from public, anon;
grant execute on function
  public.signage_pair_confirm(text, text, uuid, text), public.signage_device_update(uuid, text, uuid, text), public.signage_device_revoke(uuid), public.signage_device_delete(uuid),
  public.signage_media_add(text, text, text, text, bigint, int), public.signage_media_delete(uuid),
  public.signage_campaign_save(uuid, text, uuid, text, uuid[], uuid[], timestamptz, timestamptz, int[], int, int, int, int),
  public.signage_campaign_submit(uuid), public.signage_campaign_review(uuid, boolean, text), public.signage_campaign_pause(uuid), public.signage_campaign_delete(uuid),
  public.signage_emergency_set(boolean, text, int) to authenticated;

-- ═════ 9) التخزين (bucket عام للقراءة بمسارات عشوائية، الرفع والحذف لفريق الشاشات فقط) ═════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signage', 'signage', true, 209715200, array['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- الرفع فقط إلى media/{uid الحساب}/{uuid}.{ext}
drop policy if exists "signage_upload" on storage.objects;
create policy "signage_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'signage' and public.signage_role() is not null and (storage.foldername(name))[1] = 'media' and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "signage_remove" on storage.objects;
create policy "signage_remove" on storage.objects for delete to authenticated
  using (bucket_id = 'signage' and (public.signage_role() = 'admin' or (public.signage_role() = 'marketing' and (storage.foldername(name))[2] = auth.uid()::text)));

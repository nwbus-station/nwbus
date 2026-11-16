-- شاشات المحطات: التحكم والحماية المتقدمة.
--   • زر «إيقاف جميع الشاشات» (للأدمن) وزر تشغيلها.
--   • أوامر عن بُعد: إعادة تشغيل شاشة/كل الشاشات، لقطة حيّة لما تعرضه الشاشة، وتدوير مفتاحها.
--   • تدوير تلقائي لمفتاح كل جهاز كل 3 أيام (فمفتاح مسروق يفقد قيمته)، وكشف استنساخ المفتاح (تبدّل عنوان الشبكة بين جهازين) مع تنبيه.
--   • فرض التحقق بخطوتين (TOTP) على الأدمن وحسابات التسويق للوصول لقسم الشاشات (يُفعَّل بقرار الأدمن بعد تسجيل مصادقته).
-- يتطلب 027 و028 و029. شغّل كل كتلة (مفصولة بسطر ═══) بشكل منفصل في Supabase SQL Editor، بالترتيب.

-- ═════ 1) جدول التحكم + أعمدة الجهاز الجديدة ═════
create table if not exists public.signage_control (
  id              int primary key default 1 check (id = 1),
  halted          boolean not null default false,
  halt_reason     text,
  halted_by_name  text,
  halted_at       timestamptz,
  require_mfa     boolean not null default false,
  mfa_set_by_name text,
  mfa_set_at      timestamptz
);
insert into public.signage_control (id) values (1) on conflict do nothing;
alter table public.signage_control enable row level security;

alter table public.signage_devices
  add column if not exists reload_nonce      int not null default 0,
  add column if not exists snap_requested_at timestamptz,
  add column if not exists snapshot          text,
  add column if not exists snapshot_at       timestamptz,
  add column if not exists prev_secret_hash  text,
  add column if not exists prev_valid_until  timestamptz,
  add column if not exists secret_rotated_at timestamptz not null default now(),
  add column if not exists force_rotate      boolean not null default false,
  add column if not exists last_ip           text,
  add column if not exists last_ip_at        timestamptz,
  add column if not exists prev_ip           text,
  add column if not exists prev_ip_at        timestamptz,
  add column if not exists ua_sig            text,
  add column if not exists suspect           boolean not null default false,
  add column if not exists suspect_reason    text,
  add column if not exists suspect_at        timestamptz;

-- ═════ 2) الدور مع فرض التحقق بخطوتين + دالة الوصول للواجهة ═════
create or replace function public.signage_aal2() returns boolean
language sql stable as $$ select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' $$;

-- الدور الخام (بدون شرط التحقق)
create or replace function public.signage_role_raw() returns text
language sql security definer stable set search_path = public as $$
  select case
    when u.role::text in ('general_admin', 'stations_executive_director', 'assistant_stations_executive_director') and not coalesce(public.is_restricted(), false) then 'admin'
    when u.allowed_modules is not null and 'signage' = any(u.allowed_modules) then 'marketing'
  end
  from public.users u where u.auth_id = auth.uid() and u.is_active limit 1
$$;

-- الدور الفعلي: إن كان التحقق بخطوتين مفروضاً ولم تُكمَل الجلسة (aal2) فلا صلاحية
create or replace function public.signage_role() returns text
language sql security definer stable set search_path = public as $$
  select case when coalesce((select require_mfa from public.signage_control where id = 1), false) and not public.signage_aal2()
              then null else public.signage_role_raw() end
$$;

-- ما تحتاجه الواجهة قبل أي استعلام: الدور الخام + هل يلزم التحقق بخطوتين + هل هو مفروض
create or replace function public.signage_access() returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'role', public.signage_role_raw(),
    'mfa_required', coalesce((select require_mfa from public.signage_control where id = 1), false),
    'need_mfa', public.signage_role_raw() is not null and coalesce((select require_mfa from public.signage_control where id = 1), false) and not public.signage_aal2(),
    'aal2', public.signage_aal2())
$$;

revoke all on function public.signage_role_raw() from public, anon, authenticated;
revoke all on function public.signage_access() from public, anon;
grant execute on function public.signage_access() to authenticated;
revoke all on function public.signage_aal2() from public, anon;
grant execute on function public.signage_aal2() to authenticated;

-- الأدمن يفرض/يلغي التحقق بخطوتين (يشترط أن تكون جلسته نفسها مصادَقة بخطوتين حتى لا يُقفل الباب على نفسه)
create or replace function public.signage_mfa_require(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a public.users;
begin
  if public.signage_role_raw() is distinct from 'admin' then raise exception 'not allowed'; end if;
  if p_on and not public.signage_aal2() then raise exception 'mfa session required'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  update public.signage_control set require_mfa = p_on, mfa_set_by_name = coalesce(a.full_name_ar, ''), mfa_set_at = now() where id = 1;
  perform public.signage_log(case when p_on then 'mfa.require' else 'mfa.optional' end, '1', '{}'::jsonb);
end $$;
revoke all on function public.signage_mfa_require(boolean) from public, anon;
grant execute on function public.signage_mfa_require(boolean) to authenticated;

-- ═════ 3) سياسات القراءة وصلاحيات الأعمدة ═════
drop policy if exists sgn_ctl_sel on public.signage_control;
create policy sgn_ctl_sel on public.signage_control for select to authenticated using (public.signage_role() is not null);
revoke all on public.signage_control from public, anon, authenticated;
grant select on public.signage_control to authenticated;
-- الأعمدة الجديدة المسموح قراءتها (المفاتيح المجزَّأة وسابقها محجوبة دائماً)
grant select (reload_nonce, snap_requested_at, snapshot_at, secret_rotated_at, last_ip, last_ip_at, suspect, suspect_reason, suspect_at) on public.signage_devices to authenticated;
grant select (snapshot) on public.signage_devices to authenticated;

-- ═════ 4) إيقاف/تشغيل جميع الشاشات (الأدمن) ═════
create or replace function public.signage_halt_set(p_halted boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a public.users;
begin
  if public.signage_role() is distinct from 'admin' then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  update public.signage_control set halted = p_halted, halt_reason = case when p_halted then nullif(left(btrim(coalesce(p_reason, '')), 200), '') else null end,
    halted_by_name = coalesce(a.full_name_ar, ''), halted_at = now() where id = 1;
  perform public.signage_log(case when p_halted then 'halt.on' else 'halt.off' end, '1', jsonb_build_object('reason', p_reason));
  if p_halted then
    perform public.signage_notify_admins('أُوقفت جميع شاشات المحطات', 'أوقفها ' || coalesce(a.full_name_ar, '') || coalesce(' — ' || nullif(btrim(p_reason), ''), ''), a.id);
  end if;
end $$;

-- ═════ 5) أوامر الأجهزة عن بُعد ═════
create or replace function public.signage_device_command(p_id uuid, p_cmd text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.signage_role() is distinct from 'admin' then raise exception 'not allowed'; end if;
  if p_cmd = 'reload' then update public.signage_devices set reload_nonce = reload_nonce + 1 where id = p_id and status = 'active';
  elsif p_cmd = 'snapshot' then update public.signage_devices set snap_requested_at = now() where id = p_id and status = 'active';
  elsif p_cmd = 'rotate' then update public.signage_devices set force_rotate = true where id = p_id and status = 'active';
  else raise exception 'bad command'; end if;
  if not found then raise exception 'not found'; end if;
  if p_cmd <> 'snapshot' then perform public.signage_log('device.' || p_cmd, p_id::text, '{}'::jsonb); end if;
end $$;

create or replace function public.signage_devices_command_all(p_cmd text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if public.signage_role() is distinct from 'admin' then raise exception 'not allowed'; end if;
  if p_cmd = 'reload' then update public.signage_devices set reload_nonce = reload_nonce + 1 where status = 'active';
  elsif p_cmd = 'rotate' then update public.signage_devices set force_rotate = true where status = 'active';
  else raise exception 'bad command'; end if;
  get diagnostics n = row_count;
  perform public.signage_log('device.' || p_cmd || '_all', null, jsonb_build_object('count', n));
  return n;
end $$;

-- الأدمن يؤكد أن جهازاً مشتبهاً به سليم
create or replace function public.signage_device_clear_suspect(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.signage_role() is distinct from 'admin' then raise exception 'not allowed'; end if;
  update public.signage_devices set suspect = false, suspect_reason = null, suspect_at = null, prev_ip = null, prev_ip_at = null where id = p_id;
  if not found then raise exception 'not found'; end if;
  perform public.signage_log('device.clear_suspect', p_id::text, '{}'::jsonb);
end $$;

revoke all on function public.signage_halt_set(boolean, text), public.signage_device_command(uuid, text), public.signage_devices_command_all(text), public.signage_device_clear_suspect(uuid) from public, anon;
grant execute on function public.signage_halt_set(boolean, text), public.signage_device_command(uuid, text), public.signage_devices_command_all(text), public.signage_device_clear_suspect(uuid) to authenticated;

-- ═════ 6) مصادقة الجهاز تقبل المفتاح الحالي أو السابق (فترة سماح 15 دقيقة بعد التدوير) ═════
create or replace function public.signage_device_of(p_secret text) returns public.signage_devices
language sql security definer stable set search_path = public as $$
  select * from public.signage_devices
  where status = 'active' and (
    secret_hash = public.signage_hash(coalesce(p_secret, ''))
    or (prev_secret_hash = public.signage_hash(coalesce(p_secret, '')) and prev_valid_until > now())
  ) limit 1
$$;
revoke all on function public.signage_device_of(text) from public, anon, authenticated;

-- لقطة الشاشة (JPEG صغير) تُرفع عند الطلب فقط (أو كل 20 ثانية كحد أدنى)
create or replace function public.signage_device_snapshot(p_secret text, p_image text) returns void
language plpgsql security definer set search_path = public as $$
declare d public.signage_devices;
begin
  d := public.signage_device_of(p_secret);
  if d.id is null then raise exception 'unauthorized'; end if;
  if p_image is null or left(p_image, 23) <> 'data:image/jpeg;base64,' or length(p_image) > 220000 or substr(p_image, 24) !~ '^[A-Za-z0-9+/=]+$' then raise exception 'bad image'; end if;
  if d.snap_requested_at is null and d.snapshot_at is not null and d.snapshot_at > now() - interval '20 seconds' then return; end if;
  update public.signage_devices set snapshot = p_image, snapshot_at = now(), snap_requested_at = null where id = d.id;
end $$;
revoke all on function public.signage_device_snapshot(text, text) from public;
grant execute on function public.signage_device_snapshot(text, text) to anon, authenticated;

-- ═════ 7) القائمة: الإيقاف، الأوامر، تدوير المفتاح، كشف الاستنساخ ═════
create or replace function public.signage_manifest(p_secret text, p_version text default null, p_playing text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d public.signage_devices; e public.signage_emergency; c0 public.signage_control; v_now timestamptz := now(); lt timestamp; v_dow int; v_min int;
  v_items jsonb; v_em jsonb := null; v_halt jsonb := null; st text; v_h text; v_via_prev boolean; v_new text := null;
  v_hdr jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip text; v_ua text; v_uas text; v_susp text := null;
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
  if c0.halted then
    v_halt := jsonb_build_object('reason', c0.halt_reason);
    v_items := '[]'::jsonb;
  else
    lt := v_now at time zone 'Asia/Riyadh';
    v_dow := extract(dow from lt)::int;
    v_min := extract(hour from lt)::int * 60 + extract(minute from lt)::int;
    select * into e from public.signage_emergency where id = 1;
    if e.active and (e.ends_at is null or e.ends_at > v_now) then v_em := jsonb_build_object('message', e.message); end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'campaign_id', cp.id, 'media_id', m.id, 'kind', m.kind, 'path', m.path, 'mime', m.mime, 'size', m.size_bytes, 'config', m.config,
        'duration', case when m.kind = 'video' then m.duration_sec else coalesce(cp.duration_sec, m.duration_sec) end, 'title', cp.title
      ) order by cp.sort, cp.created_at), '[]'::jsonb) into v_items
    from public.signage_campaigns cp join public.signage_media m on m.id = cp.media_id
    where cp.status = 'approved'
      and (cp.starts_at is null or cp.starts_at <= v_now) and (cp.ends_at is null or cp.ends_at > v_now)
      and (cp.days is null or v_dow = any(cp.days))
      and (cp.from_min is null or (case when cp.from_min <= cp.to_min then v_min >= cp.from_min and v_min < cp.to_min else v_min >= cp.from_min or v_min < cp.to_min end))
      and (cp.scope = 'all' or (cp.scope = 'stations' and d.station_id = any(cp.station_ids)) or (cp.scope = 'devices' and d.id = any(cp.device_ids)));
  end if;
  select coalesce(nullif(name_ar, ''), name_en) into st from public.stations where id = d.station_id;
  return jsonb_build_object('device', jsonb_build_object('id', d.id, 'name', d.name, 'orientation', d.orientation, 'station', st),
    'now', v_now, 'emergency', v_em, 'halted', v_halt, 'items', v_items, 'ttl', 43200,
    'cmd', jsonb_build_object('reload', d.reload_nonce, 'snap', d.snap_requested_at is not null), 'new_secret', v_new);
end $$;

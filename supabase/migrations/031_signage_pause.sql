-- شاشات المحطات: إيقاف مؤقت لشاشة واحدة (تتحول إلى سوداء) مع استئنافها بضغطة بدون إعادة ربط.
-- يتطلب 030. شغّل كل كتلة (مفصولة بسطر ═══) بشكل منفصل في Supabase SQL Editor، بالترتيب.

-- ═════ 1) أعمدة الإيقاف المؤقت + الصلاحيات + دالة الأدمن ═════
alter table public.signage_devices
  add column if not exists paused         boolean not null default false,
  add column if not exists paused_at      timestamptz,
  add column if not exists paused_by_name text;
grant select (paused, paused_at, paused_by_name) on public.signage_devices to authenticated;

create or replace function public.signage_device_pause(p_id uuid, p_paused boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a public.users;
begin
  if public.signage_role() is distinct from 'admin' then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  update public.signage_devices set paused = p_paused, paused_at = case when p_paused then now() else null end,
    paused_by_name = case when p_paused then coalesce(a.full_name_ar, '') else null end where id = p_id and status = 'active';
  if not found then raise exception 'not found'; end if;
  perform public.signage_log(case when p_paused then 'device.pause' else 'device.resume' end, p_id::text, '{}'::jsonb);
end $$;
revoke all on function public.signage_device_pause(uuid, boolean) from public, anon;
grant execute on function public.signage_device_pause(uuid, boolean) to authenticated;

-- ═════ 2) القائمة: الشاشة الموقوفة مؤقتاً تستلم «halted» بلا محتوى ═════
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

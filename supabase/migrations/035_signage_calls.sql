-- نداء الركاب (المرحلة 4): عرض النداء على شاشات المحطات + أدوات الصوت (النموذج والصوت) + قاموس نطق أسماء المحطات.
-- يتطلب 027-033. شغّل كل كتلة (مفصولة بسطر ═══) بشكل منفصل، بالترتيب.

-- ═════ 1) صلاحية النداء (نفس منطق الـEdge Function swift-responder) ═════
create or replace function public.signage_can_call() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when u.role::text in ('general_admin', 'stations_executive_director', 'assistant_stations_executive_director') then true
      when coalesce(public.is_restricted(), false) then coalesce(public.title_cap('pa_calls_manage', false), false)
      else coalesce((select (rp.permissions -> 'module_access' ->> 'pa_calls')::boolean from public.role_permissions rp where rp.role::text = u.role::text), false)
    end
    from public.users u where u.auth_id = auth.uid() and u.is_active limit 1), false)
$$;
revoke all on function public.signage_can_call() from public, anon;
grant execute on function public.signage_can_call() to authenticated;

-- ═════ 2) النداءات المعروضة على الشاشات ═════
create table if not exists public.signage_calls (
  id              uuid primary key default gen_random_uuid(),
  station_ids     uuid[] not null,
  text            text not null check (length(btrim(text)) between 1 and 300),
  audio           jsonb not null default '[]'::jsonb,
  created_by      uuid references public.users(id) on delete set null,
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null
);
create index if not exists idx_signage_calls_exp on public.signage_calls(expires_at);
alter table public.signage_calls enable row level security;
revoke all on public.signage_calls from public, anon, authenticated;

-- المحطات التي فيها شاشات نشطة (لاختيار أين يظهر النداء)
create or replace function public.signage_call_targets() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.signage_can_call() then raise exception 'not allowed'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'name', coalesce(nullif(s.name_ar, ''), s.name_en), 'screens', x.n) order by coalesce(nullif(s.name_ar, ''), s.name_en))
    from (select station_id, count(*) n from public.signage_devices where status = 'active' and not paused and station_id is not null group by station_id) x
    join public.stations s on s.id = x.station_id), '[]'::jsonb);
end $$;

create or replace function public.signage_call_publish(p_stations uuid[], p_text text, p_audio jsonb default '[]'::jsonb, p_ttl int default 45) returns uuid
language plpgsql security definer set search_path = public as $$
declare a public.users; v_id uuid; n int; u text;
begin
  if not public.signage_can_call() then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  if p_text is null or btrim(p_text) = '' or length(p_text) > 300 then raise exception 'text required'; end if;
  if p_stations is null or cardinality(p_stations) = 0 or cardinality(p_stations) > 60 then raise exception 'stations required'; end if;
  select count(*) into n from public.stations where id = any(p_stations);
  if n <> cardinality(p_stations) then raise exception 'bad station'; end if;
  p_audio := coalesce(p_audio, '[]'::jsonb);
  if jsonb_typeof(p_audio) <> 'array' or jsonb_array_length(p_audio) > 8 then raise exception 'bad audio'; end if;
  for u in select jsonb_array_elements_text(p_audio) loop
    if u !~ '^https://[a-z0-9.-]+/storage/v1/object/public/audio-clips/(stations|phrases)/[A-Za-z0-9_.-]+\.mp3$' then raise exception 'bad audio'; end if;
  end loop;
  if (select count(*) from public.signage_calls where created_by = a.id and created_at > now() - interval '1 minute') >= 40 then raise exception 'too many calls'; end if;
  insert into public.signage_calls (station_ids, text, audio, created_by, created_by_name, expires_at)
  values (p_stations, btrim(p_text), p_audio, a.id, coalesce(a.full_name_ar, ''), now() + make_interval(secs => greatest(10, least(120, coalesce(p_ttl, 45)))))
  returning id into v_id;
  perform public.signage_log('call.publish', v_id::text, jsonb_build_object('title', left(btrim(p_text), 60), 'stations', cardinality(p_stations)));
  return v_id;
end $$;
revoke all on function public.signage_call_targets(), public.signage_call_publish(uuid[], text, jsonb, int) from public, anon;
grant execute on function public.signage_call_targets(), public.signage_call_publish(uuid[], text, jsonb, int) to authenticated;

-- ═════ 3) النداء الخفيف يحمل آخر نداء ساري لمحطة الشاشة ═════
create or replace function public.signage_ping(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d public.signage_devices; c0 public.signage_control; e public.signage_emergency; v_call jsonb := null; v_halted boolean;
begin
  d := public.signage_device_of(p_secret);
  if d.id is null then raise exception 'unauthorized'; end if;
  select * into c0 from public.signage_control where id = 1;
  select * into e from public.signage_emergency where id = 1;
  v_halted := coalesce(c0.halted, false) or d.paused;
  if not v_halted and d.station_id is not null then
    select jsonb_build_object('id', k.id, 'text', k.text, 'audio', k.audio, 'ttl', greatest(1, extract(epoch from (k.expires_at - now()))::int)) into v_call
    from public.signage_calls k where d.station_id = any(k.station_ids) and k.expires_at > now() order by k.created_at desc limit 1;
  end if;
  return jsonb_build_object('reload', d.reload_nonce, 'snap', d.snap_requested_at is not null, 'halted', v_halted,
    'emergency', coalesce(e.active and (e.ends_at is null or e.ends_at > now()), false), 'call', v_call);
end $$;

-- ═════ 4) إعدادات الصوت (يقرؤها swift-responder) ═════
create table if not exists public.call_voice_settings (
  id              int primary key default 1 check (id = 1),
  voice_id        text,
  model_id        text not null default 'eleven_multilingual_v2',
  stability       numeric not null default 0.85 check (stability between 0 and 1),
  similarity      numeric not null default 0.85 check (similarity between 0 and 1),
  updated_by_name text,
  updated_at      timestamptz
);
insert into public.call_voice_settings (id) values (1) on conflict do nothing;
alter table public.call_voice_settings enable row level security;
revoke all on public.call_voice_settings from public, anon, authenticated;

create or replace function public.call_voice_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.call_voice_settings;
begin
  if not public.signage_can_call() then raise exception 'not allowed'; end if;
  select * into s from public.call_voice_settings where id = 1;
  return jsonb_build_object('voice_id', s.voice_id, 'model_id', s.model_id, 'stability', s.stability, 'similarity', s.similarity, 'updated_by_name', s.updated_by_name, 'updated_at', s.updated_at);
end $$;

create or replace function public.call_voice_set(p_voice text, p_model text, p_stability numeric, p_similarity numeric) returns void
language plpgsql security definer set search_path = public as $$
declare a public.users;
begin
  if not public.signage_can_call() then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  if p_voice is not null and btrim(p_voice) <> '' and btrim(p_voice) !~ '^[A-Za-z0-9]{10,40}$' then raise exception 'bad voice id'; end if;
  if p_model not in ('eleven_multilingual_v2', 'eleven_v3', 'eleven_turbo_v2_5', 'eleven_flash_v2_5') then raise exception 'bad model'; end if;
  if p_stability is null or p_stability not between 0 and 1 or p_similarity is null or p_similarity not between 0 and 1 then raise exception 'bad settings'; end if;
  update public.call_voice_settings set voice_id = nullif(btrim(coalesce(p_voice, '')), ''), model_id = p_model, stability = p_stability, similarity = p_similarity,
    updated_by_name = coalesce(a.full_name_ar, ''), updated_at = now() where id = 1;
  perform public.signage_log('call.voice', '1', jsonb_build_object('model', p_model, 'voice', left(coalesce(p_voice, ''), 8)));
end $$;

-- ═════ 5) قاموس نطق أسماء المحطات (النص المنطوق بالتشكيل يُستخدم بدل الاسم عند توليد المقطع) ═════
create table if not exists public.call_pronunciations (
  station_id      uuid primary key references public.stations(id) on delete cascade,
  spoken          text not null check (length(btrim(spoken)) between 1 and 100),
  updated_by_name text,
  updated_at      timestamptz not null default now()
);
alter table public.call_pronunciations enable row level security;
drop policy if exists cp_sel on public.call_pronunciations;
create policy cp_sel on public.call_pronunciations for select to authenticated using (public.signage_can_call());
revoke all on public.call_pronunciations from public, anon, authenticated;
grant select on public.call_pronunciations to authenticated;

create or replace function public.call_pron_set(p_station uuid, p_spoken text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.users;
begin
  if not public.signage_can_call() then raise exception 'not allowed'; end if;
  select * into a from public.users where auth_id = auth.uid() limit 1;
  if not exists (select 1 from public.stations where id = p_station) then raise exception 'bad station'; end if;
  if p_spoken is null or btrim(p_spoken) = '' then
    delete from public.call_pronunciations where station_id = p_station;
  else
    if length(p_spoken) > 100 then raise exception 'bad spoken'; end if;
    insert into public.call_pronunciations (station_id, spoken, updated_by_name) values (p_station, btrim(p_spoken), coalesce(a.full_name_ar, ''))
    on conflict (station_id) do update set spoken = excluded.spoken, updated_by_name = excluded.updated_by_name, updated_at = now();
  end if;
  perform public.signage_log('call.pron', p_station::text, jsonb_build_object('spoken', left(coalesce(p_spoken, ''), 60)));
end $$;

revoke all on function public.call_voice_get(), public.call_voice_set(text, text, numeric, numeric), public.call_pron_set(uuid, text) from public, anon;
grant execute on function public.call_voice_get(), public.call_voice_set(text, text, numeric, numeric), public.call_pron_set(uuid, text) to authenticated;

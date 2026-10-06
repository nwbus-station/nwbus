-- ============================================================
--  المرحلة 1 — تحصين الحسابات والبيانات (شغّله كاملاً بـ SQL Editor قبل نشر الكود الجديد)
--  1) كلمات المرور: نتوقف عن حفظ نسخة قابلة للقراءة ونمسح الموجود
--  2) تعطيل الحساب يقطع صلاحياته من القاعدة فوراً + يلغي جلساته
--  3) حماية الاستبيان العام من التكرار الآلي (حد لكل IP)
-- ============================================================

-- ---------- 1) كلمات المرور ----------
alter table public.users add column if not exists password_changed boolean not null default false;

-- نوقف مؤقتاً triggers الجدول (ومنها سجل النشاط) أثناء المسح، عشان ما تنسخ كلمات المرور القديمة بسجل التغييرات
-- (كلها داخل كتلة واحدة: لو صار أي خطأ يرجع كل شي كما كان)
do $$
begin
  alter table public.users disable trigger user;
  update public.users set password_changed = true where login_password is null;
  update public.users set login_password = null where login_password is not null;
  alter table public.users enable trigger user;
end $$;

-- ---------- 2) تعطيل الحساب = قطع صلاحياته فوراً ----------
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from users
    where auth_id = auth.uid()
      and coalesce(is_active, true)
      and role::text in ('general_admin', 'stations_executive_director', 'assistant_stations_executive_director')
  )
$$;

create or replace function public.current_user_role()
returns user_role language sql security definer stable set search_path = public as $$
  select case when role::text = 'area_supervisor' then 'station_admin'::user_role else role end
  from users where auth_id = auth.uid() and coalesce(is_active, true)
$$;

-- عند تعطيل حساب: نلغي جلساته (ما يقدر يجدد توكنه) — أي خطأ بالصلاحيات يُتجاهل ولا يمنع التعطيل نفسه
create or replace function public.kick_deactivated_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if old.is_active is distinct from false and new.is_active is false and new.auth_id is not null then
    begin
      delete from auth.sessions where user_id = new.auth_id;
    exception when others then
      null;
    end;
  end if;
  return new;
end $$;

drop trigger if exists trg_kick_deactivated on public.users;
create trigger trg_kick_deactivated after update of is_active on public.users
  for each row execute function public.kick_deactivated_user();

-- ---------- 3) الاستبيان العام: حد لكل IP بالساعة ----------
alter table public.customer_surveys add column if not exists ip_hash text;
create index if not exists customer_surveys_ip_idx on public.customer_surveys (ip_hash, created_at desc);

create or replace function public.submit_customer_survey(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_kind    text  := p->>'kind';
  v_nps     int   := nullif(p->>'nps', '')::int;
  v_ratings jsonb := coalesce(p->'ratings', '{}'::jsonb);
  v_dev     text  := left(coalesce(p->>'device', ''), 64);
  v_hdr     jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip      text  := trim(split_part(coalesce(v_hdr->>'x-forwarded-for', ''), ',', 1));
  v_iph     text  := case when v_ip = '' then null else md5(v_ip || ':nwbus-survey') end;
  k text; v jsonb; n numeric;
begin
  if v_kind is null or v_kind not in ('trip', 'station') then raise exception 'invalid kind'; end if;
  if v_nps is not null and (v_nps < 0 or v_nps > 10) then raise exception 'invalid nps'; end if;
  if jsonb_typeof(v_ratings) <> 'object' then raise exception 'invalid ratings'; end if;
  if (select count(*) from jsonb_object_keys(v_ratings)) > 12 then raise exception 'too many ratings'; end if;
  for k, v in select * from jsonb_each(v_ratings) loop
    if jsonb_typeof(v) <> 'number' then raise exception 'invalid rating'; end if;
    n := (v #>> '{}')::numeric;
    if n < 1 or n > 5 or n <> floor(n) then raise exception 'invalid rating'; end if;
    if length(k) > 30 then raise exception 'invalid rating key'; end if;
  end loop;
  if v_nps is null and v_ratings = '{}'::jsonb then raise exception 'empty survey'; end if;

  if v_dev <> '' and exists (
    select 1 from customer_surveys
    where device_hash = v_dev and kind = v_kind and created_at > now() - interval '20 minutes'
  ) then raise exception 'duplicate'; end if;

  -- المحطات والحافلات تشارك IP واحد أحياناً، فالحد سخي (40 بالساعة) ويوقف الإرسال الآلي فقط
  if v_iph is not null and (
    select count(*) from customer_surveys where ip_hash = v_iph and created_at > now() - interval '1 hour'
  ) >= 40 then raise exception 'rate limited'; end if;

  insert into customer_surveys (
    kind, lang, station_id, from_station_id, to_station_id, trip_number, nps, ratings,
    improve, low_reason, comment, age_group, traveler_type, trip_purpose, frequency, contact_phone, device_hash, ip_hash
  ) values (
    v_kind, left(p->>'lang', 5),
    nullif(p->>'station_id', '')::uuid, nullif(p->>'from_station_id', '')::uuid, nullif(p->>'to_station_id', '')::uuid,
    left(nullif(trim(p->>'trip_number'), ''), 20), v_nps, v_ratings,
    coalesce(array(select left(x, 40) from jsonb_array_elements_text(coalesce(p->'improve', '[]'::jsonb)) x limit 8), '{}'),
    coalesce(array(select left(x, 40) from jsonb_array_elements_text(coalesce(p->'low_reason', '[]'::jsonb)) x limit 10), '{}'),
    left(nullif(trim(p->>'comment'), ''), 1000),
    left(p->>'age_group', 20), left(p->>'traveler_type', 30), left(p->>'trip_purpose', 30), left(p->>'frequency', 20),
    left(nullif(trim(p->>'contact_phone'), ''), 20), nullif(v_dev, ''), v_iph
  );
end $$;

revoke all on function public.submit_customer_survey(jsonb) from public;
grant execute on function public.submit_customer_survey(jsonb) to anon, authenticated;

-- ---------- فحص بعد التشغيل (للتأكد فقط) ----------
-- remaining_passwords لازم يكون 0 · audit_rows_mentioning_password لو أكبر من 0 أرسله لي ونمسحه من سجل النشاط
select
  (select count(*) from public.users where login_password is not null) as remaining_passwords,
  (select count(*) from public.users where password_changed)           as changed_by_employee,
  (select count(*) from public.users)                                  as total_users,
  (select count(*) from public.audit_log a where to_jsonb(a)::text ilike '%login_password%') as audit_rows_mentioning_password;

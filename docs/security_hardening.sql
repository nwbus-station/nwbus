-- ============================================================
-- تحصين أمني — يسدّ ثغرات وجدها الفحص. شغّله كله مرة وحدة (آمن للتكرار).
-- شغّل قبله: title_permissions_rls.sql و role_permissions.sql
-- ============================================================

-- 1) حماية الأعمدة الحساسة في جدول users من التعديل الذاتي/غير المصرّح
--    (بدونها أي موظف يقدر يغيّر دوره بنفسه من الخلفية!)
create or replace function guard_users_privileged()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_self boolean;
  v_lo constant text[] := array['station_employee','accountant','shift_supervisor'];
begin
  -- محرر SQL / مفتاح الخدمة (الـ edge functions): بدون هوية مستخدم
  if auth.uid() is null or auth.role() = 'service_role' then return new; end if;
  -- الأدمن العام (غير المقيّد): كل شي مسموح
  if is_admin() and not is_restricted() then return new; end if;

  if tg_op = 'INSERT' then
    if new.role::text <> all(v_lo) or new.custom_title_id is not null then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    return new;
  end if;

  v_self := old.auth_id = auth.uid();
  if new.auth_id is distinct from old.auth_id
     or new.custom_title_id is distinct from old.custom_title_id
     or new.leave_balance_override is distinct from old.leave_balance_override
     or (new.role is distinct from old.role
         and (v_self or old.role::text <> all(v_lo) or new.role::text <> all(v_lo)))
     or (v_self and (
            new.allowed_modules       is distinct from old.allowed_modules
         or new.is_active             is distinct from old.is_active
         or new.supervisor_id         is distinct from old.supervisor_id
         or new.job_title             is distinct from old.job_title
         or new.station_id            is distinct from old.station_id
         or new.is_accountant         is distinct from old.is_accountant
         or new.is_agent              is distinct from old.is_agent
         or new.can_rate_customers    is distinct from old.can_rate_customers))
     or (not v_self and old.role::text <> all(v_lo))
  then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_users on users;
create trigger trg_guard_users before insert or update on users
  for each row execute function guard_users_privileged();

-- 2) دالة قديمة بدون أي تحقق من المستدعي (تسمح لأي أحد بتعديل أقسام أي موظف) — غير مستخدمة بالتطبيق
drop function if exists update_user_modules(uuid, text[]);

-- 3) الدوال الإدارية: منع الحساب المقيّد + إغلاقها عن الزوار غير المسجلين
do $$
declare
  fn text; oid_ regprocedure; args text; names text; res text; retset boolean; body text;
begin
  foreach fn in array array['import_schedule', 'merge_stations_rpc'] loop
    if exists (select 1 from pg_proc where proname = fn || '_impl' and pronamespace = 'public'::regnamespace) then continue; end if;
    select p.oid::regprocedure, p.proretset, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
           (select string_agg(x.n, ', ' order by x.o)
              from unnest(p.proargnames, coalesce(p.proargmodes, array_fill('i'::"char", array[cardinality(p.proargnames)])))
                   with ordinality as x(n, m, o)
             where x.m in ('i','b','v'))
      into oid_, retset, args, res, names
    from pg_proc p where p.proname = fn and p.pronamespace = 'public'::regnamespace;
    if oid_ is null then raise notice 'الدالة % غير موجودة — تخطّيتها', fn; continue; end if;
    if names is null then raise notice 'الدالة % بدون أسماء معاملات — تخطّيتها', fn; continue; end if;

    execute format('alter function %s rename to %I', oid_, fn || '_impl');
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated', fn || '_impl',
      (select string_agg(format_type(t, null), ', ') from unnest((select proargtypes::oid[] from pg_proc where proname = fn || '_impl' and pronamespace = 'public'::regnamespace)) t));
    if retset then
      body := format('select i.* from (select assert_not_restricted()) g, %I(%s) i', fn || '_impl', names);
    else
      body := format('select %I(%s) from (select assert_not_restricted()) g', fn || '_impl', names);
    end if;
    execute format('create function public.%I(%s) returns %s language sql volatile security definer set search_path = public as %L', fn, args, res, body);
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select oid::regprocedure as sig from pg_proc
            where pronamespace = 'public'::regnamespace
              and proname in ('get_user_sensitive','admin_update_user','import_schedule','merge_stations_rpc')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- 4) search_path ثابت للدوال المساعدة (تجاهل اللي ما هي موجودة)
do $$
declare f text;
begin
  foreach f in array array['current_user_role()','current_user_station_id()','current_user_id()'] loop
    begin
      execute format('alter function %s set search_path = public', f);
    exception when undefined_function then null;
    end;
  end loop;
end $$;

-- 5) title_cap: قيمة غير منطقية بمصفوفة الصلاحيات ما تكسر كل الاستعلامات
create or replace function title_cap(k text, dflt boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when jsonb_typeof(t.permissions->k) = 'boolean' then (t.permissions->>k)::boolean end
       from users u join custom_titles t on t.id = u.custom_title_id
      where u.auth_id = auth.uid()),
    (select case when jsonb_typeof(rp.permissions->k) = 'boolean' then (rp.permissions->>k)::boolean end
       from users u join role_permissions rp on rp.role = u.role::text
      where u.auth_id = auth.uid()),
    dflt)
$$;

-- 6) منع حذف مسمى مخصص لا يزال عليه حسابات (حذفه كان يحوّل الحساب المقيّد إلى أدمن كامل!)
create or replace function prevent_title_delete_in_use()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from users where custom_title_id = old.id) then
    raise exception 'المسمى عليه حسابات — انقلهم لمسمى ثاني أولاً' using errcode = '23503';
  end if;
  return old;
end $$;
drop trigger if exists trg_prevent_title_delete on custom_titles;
create trigger trg_prevent_title_delete before delete on custom_titles
  for each row execute function prevent_title_delete_in_use();

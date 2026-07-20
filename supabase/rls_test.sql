-- ============================================================
-- اختبار سياسات الأمان (RLS) — ينتحل هوية مستخدم من كل دور ويتحقق
-- أن كل دور محصور في نطاقه. آمن: لا يعدّل أي بيانات.
-- شغّله في SQL Editor واقرأ جدول النتائج: ✅ = محمي، ❌ = ثغرة
-- ============================================================

drop table if exists _rls_results;
create temp table _rls_results(
  n serial, "الدور" text, "المستخدم" text, "الاختبار" text,
  "المتوقع" text, "الفعلي" text, "النتيجة" text
);

do $$
declare
  u        record;
  my_sts   uuid[];
  me       uuid;
  c_trips  bigint; c_users bigint; c_sales bigint; c_notif bigint;
  c_audit  bigint; c_upd   bigint; c_all   bigint;
  rec_other uuid;
begin
  for u in
    select distinct on (role) id, username, role, auth_id
    from users
    where is_active and auth_id is not null
      and role in ('station_employee', 'station_admin', 'accountant', 'general_admin')
    order by role, created_at
  loop
    /* محطات هذا المستخدم (تُحسب قبل الانتحال) */
    select coalesce(array_agg(distinct sid), '{}') into my_sts from (
      select station_id as sid from users where id = u.id and station_id is not null
      union
      select station_id from user_stations where user_id = u.id
    ) t;
    me := u.id;

    /* سجل رحلة من محطة أجنبية — هدف محاولة التعديل */
    select id into rec_other from trip_records
    where not (station_id = any(my_sts))
    limit 1;

    /* ── انتحال الهوية ── */
    perform set_config('request.jwt.claims',
      json_build_object('sub', u.auth_id::text, 'role', 'authenticated')::text, false);
    execute 'set role authenticated';

    /* القياسات تحت سياسات RLS */
    select count(*) into c_all   from trip_records;
    select count(*) into c_trips from trip_records where not (station_id = any(my_sts));
    select count(*) into c_users from users
      where id <> me
        and (u.role <> 'station_admin' or station_id is null or not (station_id = any(my_sts)));
    select count(*) into c_sales from sales_records
      where created_by <> me and not (station_id = any(my_sts));
    select count(*) into c_notif from notifications where user_id <> me;
    select count(*) into c_audit from audit_log
      where (u.role <> 'station_admin' or station_id is null or not (station_id = any(my_sts)));

    c_upd := 0;
    if rec_other is not null then
      update trip_records set notes = notes where id = rec_other;
      get diagnostics c_upd = row_count;
    end if;

    /* ── العودة للمشرف وتسجيل النتائج ── */
    execute 'reset role';

    if u.role = 'general_admin' then
      insert into _rls_results("الدور","المستخدم","الاختبار","المتوقع","الفعلي","النتيجة") values
      (u.role, u.username, 'الأدمن يرى كل سجلات الرحلات', '> 0', c_all::text,
        case when c_all > 0 then '✅' else '❌' end),
      (u.role, u.username, 'الأدمن يرى إشعارات غيره (خصوصية)', '0', c_notif::text,
        case when c_notif = 0 then '✅' else '❌' end);
    else
      insert into _rls_results("الدور","المستخدم","الاختبار","المتوقع","الفعلي","النتيجة") values
      (u.role, u.username, 'يرى سجلات رحلات محطات غيره؟', '0', c_trips::text,
        case when c_trips = 0 then '✅' else '❌' end),
      (u.role, u.username, 'يرى مستخدمين خارج نطاقه؟', '0', c_users::text,
        case when c_users = 0 then '✅' else '❌' end),
      (u.role, u.username, 'يرى مبيعات خارج نطاقه؟', '0', c_sales::text,
        case when c_sales = 0 then '✅' else '❌' end),
      (u.role, u.username, 'يرى إشعارات غيره؟', '0', c_notif::text,
        case when c_notif = 0 then '✅' else '❌' end),
      (u.role, u.username, 'يرى سجل تدقيق خارج نطاقه؟', '0', c_audit::text,
        case when c_audit = 0 then '✅' else '❌' end),
      (u.role, u.username, 'نجح بتعديل سجل محطة أجنبية؟', '0', c_upd::text,
        case when c_upd = 0 then '✅' else '❌' end);
    end if;

    perform set_config('request.jwt.claims', '', false);
  end loop;

  execute 'reset role';
end $$;

select "الدور", "المستخدم", "الاختبار", "المتوقع", "الفعلي", "النتيجة"
from _rls_results order by n;

-- ============================================================
-- تحصين دوال الأدمن (get_user_sensitive / admin_update_user) ضد الحساب المقيّد
-- شغّل ملف title_permissions_rls.sql أولاً (يعرّف is_restricted و assert_not_restricted).
-- الفكرة: نعيد تسمية الدالة الأصلية إلى *_impl ونقفلها، ونعمل دالة بنفس الاسم والتوقيع
-- تتحقق من الحساب المقيّد ثم تستدعي الأصلية. لا يتغير شي عند أي مستخدم غير مقيّد.
-- آمن للتشغيل أكثر من مرة.
-- ============================================================
do $$
declare
  fn text; oid_ regprocedure; rec record;
  args text; names text; res text; retset boolean; body text;
begin
  foreach fn in array array['get_user_sensitive', 'admin_update_user'] loop
    -- تخطّى لو سبق تحصينها
    if exists (select 1 from pg_proc where proname = fn || '_impl' and pronamespace = 'public'::regnamespace) then
      continue;
    end if;
    select p.oid::regprocedure, p.proretset,
           pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
           (select string_agg(x.n, ', ' order by x.o)
              from unnest(p.proargnames, coalesce(p.proargmodes, array_fill('i'::"char", array[cardinality(p.proargnames)])))
                   with ordinality as x(n, m, o)
             where x.m in ('i', 'b', 'v'))
      into oid_, retset, args, res, names
    from pg_proc p where p.proname = fn and p.pronamespace = 'public'::regnamespace;
    if oid_ is null then raise notice 'الدالة % غير موجودة — تخطّيتها', fn; continue; end if;

    execute format('alter function %s rename to %I', oid_, fn || '_impl');
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated',
                   fn || '_impl', (select string_agg(format_type(t, null), ', ') from unnest((select proargtypes::oid[] from pg_proc where proname = fn || '_impl' and pronamespace = 'public'::regnamespace)) t));

    if retset then
      body := format('select i.* from (select assert_not_restricted()) g, %I(%s) i', fn || '_impl', names);
    else
      body := format('select %I(%s) from (select assert_not_restricted()) g', fn || '_impl', names);
    end if;
    execute format('create function public.%I(%s) returns %s language sql volatile security definer set search_path = public as %L',
                   fn, regexp_replace(args, '\s+DEFAULT\s+', ' DEFAULT ', 'g'), res, body);
    execute format('grant execute on function public.%I(%s) to authenticated', fn,
                   (select string_agg(format_type(t, null), ', ') from unnest((select proargtypes::oid[] from pg_proc where proname = fn and pronamespace = 'public'::regnamespace)) t));
  end loop;
end $$;

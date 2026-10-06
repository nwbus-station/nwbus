-- ب) دوال SECURITY DEFINER يقدر ينفذها أي مسجّل دخول وتفحص "أدمن" بدون فحص الحساب المقيّد
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
  and has_function_privilege('authenticated', p.oid, 'execute')
  and pg_get_functiondef(p.oid) ~* 'is_admin\(\)|general_admin'
  and pg_get_functiondef(p.oid) !~* 'is_restricted|assert_not_restricted|title_cap'
order by 1;

-- فحص دقيق (قراءة فقط): كل أمر (SELECT/INSERT/UPDATE/DELETE) تعطيه سياسة "أدمن" — هل فوقه حارس RESTRICTIVE يمنع الحساب المقيّد؟
-- الحراس عندنا مقسّمة لكل أمر على حدة، فلازم نفحص كل أمر لحاله (الفحص القديم كان يعطي إنذارات كاذبة)
with perm as (
  select schemaname, tablename, policyname, cmd
  from pg_policies
  where schemaname in ('public', 'storage') and permissive = 'PERMISSIVE'
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~* 'is_admin\(\)|general_admin|stations_executive_director'
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) !~* 'is_restricted|title_cap|job_cap'
),
need as (
  select p.*, c as need_cmd
  from perm p,
       lateral unnest(case when p.cmd = 'ALL' then array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] else array[p.cmd] end) as c
)
select n.tablename, n.policyname, n.need_cmd
from need n
where not exists (
  select 1 from pg_policies r
  where r.schemaname = n.schemaname and r.tablename = n.tablename and r.permissive = 'RESTRICTIVE'
    and (r.cmd = 'ALL' or r.cmd = n.need_cmd)
)
order by n.tablename, n.need_cmd, n.policyname;

-- فحص (قراءة فقط): هل فيه أي مكان بالقاعدة يعامل الحساب المقيّد (مشرف المرحلين مثلاً) كأنه أدمن؟

-- أ) سياسات تعطي الأدمن وصولاً بدون أي فحص لـ "الحساب المقيّد" — وهل فوقها حارس RESTRICTIVE؟
-- (الصف اللي has_restrictive_guard فيه false = ثغرة محتملة)
with p as (
  select schemaname, tablename, policyname, cmd,
         coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
  from pg_policies
  where schemaname in ('public', 'storage') and permissive = 'PERMISSIVE'
)
select p.tablename, p.policyname, p.cmd,
       exists (select 1 from pg_policies r
               where r.schemaname = p.schemaname and r.tablename = p.tablename
                 and r.permissive = 'RESTRICTIVE' and (r.cmd = p.cmd or r.cmd = 'ALL')) as has_restrictive_guard
from p
where p.expr ~* 'is_admin\(\)|general_admin|stations_executive_director'
  and p.expr !~* 'is_restricted|title_cap|job_cap'
order by has_restrictive_guard, p.tablename, p.policyname;

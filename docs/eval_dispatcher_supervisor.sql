-- ============================================================
--  مشرف المرحّلين في التقييم الوظيفي + Event
--  1) مصدر تقييم جديد 'dispatcher_supervisor' (يحل محل مشرف المحطة أو الوردية تلقائياً — الحساب يتم بالتطبيق)
--  2) دالة تعرض لمشرف المرحّلين من قيّمه مشرف المحطة/الوردية (بدون درجات) ليعرف مكان تقييمه
--  شغّله كاملاً بـ SQL Editor
-- ============================================================

-- 1) السماح بالقيمة الجديدة: نشيل أي قيد (check) قديم على eval_source ونعيد قيد المسميات بالقيم الأربع
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.custom_titles'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%eval_source%'
  loop
    execute format('alter table public.custom_titles drop constraint %I', c.conname);
  end loop;
  if to_regclass('public.employee_evaluations') is not null then
    for c in select conname from pg_constraint
             where conrelid = 'public.employee_evaluations'::regclass and contype = 'c'
               and pg_get_constraintdef(oid) ilike '%eval_source%'
    loop
      execute format('alter table public.employee_evaluations drop constraint %I', c.conname);
    end loop;
  end if;
end $$;

alter table public.custom_titles add constraint custom_titles_eval_source_check
  check (eval_source is null or eval_source in ('shift_supervisor', 'station_admin', 'stations_executive_director', 'dispatcher_supervisor'));

-- 2) حضور المصادر لكل موظف (بدون درجات): يستدعيها مشرف المرحّلين فقط لمعرفة هل اكتمل تقييم المحطة والوردية
create or replace function public.employee_eval_presence(p_month int, p_year int, p_ids uuid[])
returns table (employee_id uuid, eval_source text)
language sql stable security definer set search_path = public as $$
  select e.employee_id, e.eval_source::text
  from employee_evaluations e
  where e.eval_month = p_month and e.eval_year = p_year and e.employee_id = any(p_ids)
    and exists (
      select 1 from users u
      where u.auth_id = auth.uid() and coalesce(u.is_active, true)
        and (u.role::text in ('general_admin', 'stations_executive_director', 'assistant_stations_executive_director',
                              'station_admin', 'area_supervisor', 'shift_supervisor')
             or u.custom_title_id is not null)
    )
$$;
revoke all on function public.employee_eval_presence(int, int, uuid[]) from public;
grant execute on function public.employee_eval_presence(int, int, uuid[]) to authenticated;

-- فحص: لازم يرجع صفاً واحداً (القيد الجديد)
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.custom_titles'::regclass and conname = 'custom_titles_eval_source_check';

-- مسح كلمات المرور القديمة من سجل النشاط (before_data / after_data) — بقية السجل ما تتغير
do $$
begin
  alter table public.audit_log disable trigger user;
  update public.audit_log
     set before_data = (before_data::jsonb - 'login_password'),
         after_data  = (after_data::jsonb  - 'login_password')
   where to_jsonb(audit_log)::text ilike '%login_password%';
  alter table public.audit_log enable trigger user;
end $$;

-- لازم يرجع 0
select count(*) as audit_rows_mentioning_password
from public.audit_log a where to_jsonb(a)::text ilike '%login_password%';

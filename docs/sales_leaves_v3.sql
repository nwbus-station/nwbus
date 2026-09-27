-- ============================================================
-- 1) مهام المحاسب في الإيرادات تنفرض من القاعدة (تأكيد السجل، إقرار العجز، ملاحظات المحاسب)
-- 2) رفع مرفق الإجازة (مرضية/زواج/مولود/وفاة) بعد تقديم الطلب — الموظف ما يقدر يعدّل إجازته مباشرة
-- ============================================================

create or replace function guard_sales_accountant()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old_conf boolean := false;
  v_old_notes text := null;
  v_conf_on boolean;
  v_conf_off boolean;
begin
  if auth.uid() is null or auth.role() = 'service_role' then return new; end if;
  if is_admin() and not is_restricted() then return new; end if;

  if tg_op = 'UPDATE' then
    v_old_conf := coalesce(old.is_confirmed, false);
    v_old_notes := old.accountant_notes;
  end if;
  v_conf_on  := coalesce(new.is_confirmed, false) and not v_old_conf;
  v_conf_off := v_old_conf and not coalesce(new.is_confirmed, false);

  if (v_conf_on or v_conf_off) and not title_cap('sales_confirm', true) then
    raise exception 'ما عندك صلاحية تأكيد سجل الإيراد' using errcode = '42501';
  end if;
  -- الملاحظات: مسموحة لمن عنده صلاحية الملاحظات، أو ضمن عملية التأكيد نفسها
  if new.accountant_notes is distinct from v_old_notes
     and not v_conf_on and not title_cap('sales_notes', true) then
    raise exception 'ما عندك صلاحية كتابة ملاحظات المحاسب' using errcode = '42501';
  end if;
  -- إقرار العجز (نصه يُضاف للملاحظات عند التأكيد)
  if new.accountant_notes like '%تم إقرار العجز%'
     and (v_old_notes is null or v_old_notes not like '%تم إقرار العجز%')
     and not title_cap('sales_deficit_ack', true) then
    raise exception 'ما عندك صلاحية إقرار العجز' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_sales_accountant on sales_records;
create trigger trg_guard_sales_accountant before insert or update on sales_records
  for each row execute function guard_sales_accountant();

-- حفظ رابط المرفق: للموظف صاحب الطلب فقط، ولمرة وحدة، وللأنواع اللي تحتاج إثبات، والرابط من مجلده هو
create or replace function add_leave_proof(p_leave_id uuid, p_url text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_n int;
begin
  v_uid := current_user_id();
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_url is null or position('/leave-attachments/' || v_uid::text || '/' in p_url) = 0 then
    raise exception 'invalid url' using errcode = '22023';
  end if;
  update leaves set attachment_url = p_url
   where id = p_leave_id
     and employee_id = v_uid
     and attachment_url is null
     and leave_type::text in ('sick', 'marriage', 'paternity', 'bereavement');
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

revoke execute on function add_leave_proof(uuid, text) from public, anon;
grant execute on function add_leave_proof(uuid, text) to authenticated;

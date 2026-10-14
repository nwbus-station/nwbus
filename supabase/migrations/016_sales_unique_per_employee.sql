-- الإيرادات: التكرار المرفوض = نفس الموظف بنفس المحطة والتاريخ والوردية.
-- أكثر من موظف بنفس الوردية مسموح (والأدمن يدخل لعدة موظفين من حساب واحد).
alter table sales_records drop constraint if exists sales_records_station_id_sale_date_shift_created_by_key;

create unique index if not exists sales_records_unique_employee_shift
  on sales_records (station_id, sale_date, shift, created_by, (coalesce(lower(btrim(employee_name)), '')));

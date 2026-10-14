-- اليوم التشغيلي للإيرادات: لا تُقبل إيرادات بتاريخ أكبر من اليوم التشغيلي الحالي.
-- اليوم الجديد يبدأ عند sales_day_cutoff (افتراضي 01:30) بتوقيت الرياض؛ قبله تُدخل الوردية الأخيرة بتاريخ أمس.
create or replace function sales_business_date() returns date
language plpgsql stable set search_path = public as $$
declare
  raw text;
  m text[];
  mins int := 90;
begin
  select trim(both '"' from value::text) into raw from app_settings where key = 'sales_day_cutoff';
  m := regexp_match(coalesce(raw, ''), '^(\d{1,2}):(\d{2})$');
  if m is not null then mins := m[1]::int * 60 + m[2]::int; end if;
  if mins < 0 or mins > 360 then mins := 90; end if;
  return ((now() at time zone 'Asia/Riyadh') - make_interval(mins => mins))::date;
end $$;

create or replace function trg_sales_no_future_day() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.sale_date > sales_business_date() then
    raise exception 'sales_future_day: اليوم الجديد لم يُفتح بعد للإيرادات';
  end if;
  return new;
end $$;

drop trigger if exists sales_no_future_day on sales_records;
create trigger sales_no_future_day before insert on sales_records
  for each row execute function trg_sales_no_future_day();

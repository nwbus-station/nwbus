-- محطات "وصول ومغادرة ببطاقة إدخال واحدة" (مثل الطائف) — يُفعَّل من المحطات → تعديل المحطة.
-- عمود على stations فقط، الافتراضي false لكل المحطات الحالية (لا يتغيّر شي عليها).
alter table stations add column if not exists combined_arr_dep boolean not null default false;

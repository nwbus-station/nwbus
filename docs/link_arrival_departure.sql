-- ربط رحلة وصول برحلة مغادرة (نفس الباص يكمل بها) — يُضبط من "تفعيل رحلات المحطة"
-- عمود على station_trips: صف الوصول يشير لرحلة المغادرة اللي يكملها نفس الباص عند نفس المحطة.
-- إضافة فقط — لا يمس أي بيانات موجودة، والقيمة افتراضياً NULL (بدون ربط) لكل الرحلات الحالية.
alter table station_trips add column if not exists linked_trip_id uuid references trip_schedule(id);

grant select on public.station_trips to anon;
grant select, insert, update, delete on public.station_trips to authenticated;
grant select, insert, update, delete on public.station_trips to service_role;

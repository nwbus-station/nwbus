-- شاشة العرض (الفعلي) لجهاز بلا محطة: طرف الحدث هو محطة التسجيل نفسها (الوصول إلى محطة التسجيل، المغادرة منها).
-- يتطلب 036/037. يعدّل الدالة الحالية بدل إعادة كتابتها كاملة.
do $$ declare d text; n text; begin
  select pg_get_functiondef('public.signage_board(text,text)'::regprocedure) into d;
  n := replace(d, 'x.trip_number as tn, x.fs as f_id, x.dst as t_id from r x where x.actual_arrival is not null', 'x.trip_number as tn, x.fs as f_id, x.rs as t_id from r x where x.actual_arrival is not null');
  n := replace(n, '''-d'', ''departure'', x.actual_departure, x.bus_number, x.trip_number, x.fs, x.dst from r x', '''-d'', ''departure'', x.actual_departure, x.bus_number, x.trip_number, x.rs, x.dst from r x');
  if n = d then raise exception 'pattern not found'; end if;
  execute n;
end $$;

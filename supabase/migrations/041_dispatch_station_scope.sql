-- الإرساليات (وارد وصادر): لا تظهر إلا لمحطة الحساب نفسه (الأساسية + المربوطة به)، ما عدا الأدمن (المدير العام والإدارة العليا).
-- كانت القراءة مفتوحة لكل مستخدم مسجَّل والفلترة في الواجهة فقط؛ هنا تصير على مستوى قاعدة البيانات.
-- شغّل كل كتلة (مفصولة بسطر ═══) بشكل منفصل، بالترتيب. تتطلب 024 و025.

-- ═════ 1) دوال الصلاحية ═════
-- هل الحساب أدمن (يرى كل الإرساليات)؟
create or replace function public.dsp_sees_all() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.dsp_is_admin(u.role::text) from public.users u where u.auth_id = auth.uid() and u.is_active limit 1), false)
$$;

-- محطات الحساب: الأساسية + المربوطة (user_stations)
create or replace function public.dsp_my_stations() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct s), '{}'::uuid[]) from (
    select u.station_id as s from public.users u where u.auth_id = auth.uid() and u.is_active and u.station_id is not null
    union
    select us.station_id from public.user_stations us join public.users u on u.id = us.user_id where u.auth_id = auth.uid() and u.is_active
  ) x
$$;

-- هل ترتبط هذه الإرسالية بمحطة الحساب (مرسِلة أو مستقبِلة في أي خط)؟
create or replace function public.dsp_can_see(p_dispatch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.dsp_sees_all() or exists (
    select 1 from public.dispatch_legs l
    where l.dispatch_id = p_dispatch and (l.from_station_id = any (public.dsp_my_stations()) or l.to_station_id = any (public.dsp_my_stations())))
$$;

revoke all on function public.dsp_sees_all(), public.dsp_my_stations(), public.dsp_can_see(uuid) from public, anon;
grant execute on function public.dsp_sees_all(), public.dsp_my_stations(), public.dsp_can_see(uuid) to authenticated;

-- ═════ 2) سياسات القراءة ═════
drop policy if exists dsp_sel  on public.dispatches;
create policy dsp_sel  on public.dispatches        for select using (public.dsp_can_see(id));
drop policy if exists dspl_sel on public.dispatch_legs;
-- كل خطوط الإرسالية المرتبطة بمحطتي (يظهر المسار كاملاً: الخط الأول والثاني)
create policy dspl_sel on public.dispatch_legs     for select using (public.dsp_can_see(dispatch_id));
drop policy if exists dspi_sel on public.dispatch_items;
create policy dspi_sel on public.dispatch_items    for select using (public.dsp_can_see(dispatch_id));
drop policy if exists dspn_sel on public.dispatch_notes;
create policy dspn_sel on public.dispatch_notes    for select using (public.dsp_can_see(dispatch_id));
drop policy if exists dspr_sel on public.dispatch_requests;
create policy dspr_sel on public.dispatch_requests for select using (
  public.dsp_sees_all()
  or holder_station_id = any (public.dsp_my_stations())
  or to_station_id = any (public.dsp_my_stations())
  or requester_station_id = any (public.dsp_my_stations()));

-- ============================================================
-- الأقسام v2: إعداد كل دور صار خريطة صريحة (permissions.module_access) + منطق واحد يطابق التطبيق
-- شغّله بعد security_hardening.sql
-- ============================================================

create or replace function module_default(p_role text, p_mod text)
returns boolean language sql immutable as $$
  select case
    when p_mod = 'reports'    then p_role in ('station_admin','area_supervisor','accountant')
    when p_mod = 'evaluation' then p_role in ('station_admin','area_supervisor','shift_supervisor')
    when p_mod in ('users','map') then p_role in ('station_admin','area_supervisor')
    when p_mod in ('customer_ratings','stations','settings','magazine') then false
    else true
  end
$$;

-- الأولوية: قفل ثابت ← مسمى مخصص ← إعداد الأدمن الصريح ← الصيغة القديمة ← الافتراضي (نفس constants.js)
create or replace function role_module_ok(p_role text, p_mod text, p_row jsonb, p_has_title boolean)
returns boolean language sql immutable as $$
  select case
    when p_role in ('general_admin','stations_executive_director','assistant_stations_executive_director') then true
    when p_mod in ('settings','customer_ratings') then false
    when p_mod = 'magazine' then p_has_title
    when p_has_title then module_default(p_role, p_mod)
    when jsonb_typeof(p_row->'module_access'->p_mod) = 'boolean' then (p_row->'module_access'->>p_mod)::boolean
    when jsonb_typeof(p_row->'modules') = 'array'
         and p_mod = any (array['transportation','lost_found','sales','reports','leaves','survey','evaluation','users','map','customer_ratings','live_board','magazine'])
      then jsonb_exists(p_row->'modules', p_mod)
    else module_default(p_role, p_mod)
  end
$$;

create or replace function enforce_role_modules()
returns trigger language plpgsql security definer set search_path = public as $$
declare rp jsonb;
begin
  if new.allowed_modules is null then return new; end if;
  select permissions into rp from role_permissions where role = new.role::text;
  new.allowed_modules := coalesce(
    (select array_agg(m) from unnest(new.allowed_modules) m
       where role_module_ok(new.role::text, m, rp, new.custom_title_id is not null)),
    '{}'::text[]);
  return new;
end $$;

-- القسم ضمن أقسام الحساب + ضمن سقف دوره (يُستخدم في سياسات RLS)
create or replace function title_module(k text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select ((u.allowed_modules is null) or (k = any(u.allowed_modules)))
       and role_module_ok(u.role::text, k, rp.permissions, u.custom_title_id is not null)
    from users u
    left join role_permissions rp on rp.role = u.role::text
    where u.auth_id = auth.uid()
  ), false)
$$;

-- بيانات المبيعات/الموجودات: من عنده القسم نفسه، أو قسم التقارير مع صلاحية تقريرها (كان الشرط الثاني يبطل القسم تماماً)
drop policy if exists "rrole_sales_all" on sales_records;
create policy "rrole_sales_all" on sales_records as restrictive for all to authenticated using (
  not is_role_limited() or title_module('sales') or (title_module('reports') and title_cap('reports_sales', true))
);
drop policy if exists "rrole_lost_all" on lost_found_items;
create policy "rrole_lost_all" on lost_found_items as restrictive for all to authenticated using (
  not is_role_limited() or title_module('lost_found') or (title_module('reports') and title_cap('reports_lost', true))
);
drop policy if exists "rst_sales_all" on sales_records;
create policy "rst_sales_all" on sales_records as restrictive for all to authenticated using (
  not is_restricted()
  or ((title_module('sales') or (title_module('reports') and title_cap('reports_sales', true))) and in_scope(station_id))
);
drop policy if exists "rst_lost_all" on lost_found_items;
create policy "rst_lost_all" on lost_found_items as restrictive for all to authenticated using (
  not is_restricted()
  or ((title_module('lost_found') or (title_module('reports') and title_cap('reports_lost', true))) and in_scope(station_id))
);
